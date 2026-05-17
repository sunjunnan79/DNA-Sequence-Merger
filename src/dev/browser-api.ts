import type { Plugin } from 'vite';
import { spawnSync } from 'child_process';
import { join } from 'path';

/**
 * 给 Vite 浏览器预览补一层仅开发环境使用的规则管理 API。
 *
 * 正式桌面应用依然通过 Electron preload + IPC 访问数据库；但在 Codex/浏览器预览里，
 * 页面没有 `window.electronAPI`，会导致规则保存一直提示“系统初始化中”。
 * 这里复用同一个用户数据目录下的 dna-merger.db，让浏览器预览也能编辑原规则。
 */
export function browserRuleApiPlugin(): Plugin {
  return {
    name: 'dna-browser-rule-api',
    configureServer(server) {
      server.middlewares.use('/__dev-api/rules', async (req, res) => {
        try {
          const method = req.method || 'GET';
          const idMatch = req.url?.match(/^\/(\d+)$/);

          if (method === 'GET') {
            sendJson(res, runPython('getRules'));
            return;
          }

          if (method === 'POST') {
            const body = await readBody(req);
            sendJson(res, runPython('saveRule', body));
            return;
          }

          if (method === 'DELETE' && idMatch) {
            sendJson(res, runPython('deleteRule', JSON.stringify({ id: Number(idMatch[1]) })));
            return;
          }

          sendJson(res, { error: `Unsupported dev API route: ${method} ${req.url}` }, 404);
        } catch (error) {
          sendJson(res, { error: (error as Error).message }, 500);
        }
      });
    },
  };
}

function sendJson(res: Parameters<NonNullable<Plugin['configureServer']>>[0]['middlewares'] extends infer _ ? any : never, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function runPython(action: 'getRules' | 'saveRule' | 'deleteRule', input = '{}'): unknown {
  const appData = process.env.APPDATA || '';
  const dbPath = join(appData, 'dna-sequence-merger-desktop', 'dna-merger.db');
  const script = `
import json, sqlite3, sys, pathlib
db_path = pathlib.Path(r'''${dbPath.replace(/\\/g, '\\\\')}''')
action = ${JSON.stringify(action)}
payload = json.loads(sys.stdin.read() or '{}')

def ensure_schema(con):
    con.execute('''
        CREATE TABLE IF NOT EXISTS merge_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          subject_sequence TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    con.execute('''
        CREATE TABLE IF NOT EXISTS fragment_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rule_id INTEGER NOT NULL,
          order_index INTEGER NOT NULL,
          file_pattern TEXT NOT NULL,
          start_sequence TEXT,
          end_sequence TEXT,
          include_start BOOLEAN DEFAULT 0,
          include_end BOOLEAN DEFAULT 0,
          reverse_complement BOOLEAN DEFAULT 0,
          FOREIGN KEY (rule_id) REFERENCES merge_rules(id) ON DELETE CASCADE
        )
    ''')
    cols = [row[1] for row in con.execute('PRAGMA table_info(fragment_rules)')]
    if 'reverse_complement' not in cols:
        con.execute('ALTER TABLE fragment_rules ADD COLUMN reverse_complement BOOLEAN DEFAULT 0')
        cols.append('reverse_complement')
    if 'use_reverse_complement' in cols:
        con.execute('''
            UPDATE fragment_rules
            SET reverse_complement = CASE
              WHEN COALESCE(use_reverse_complement, 0) = 1 THEN 1
              ELSE COALESCE(reverse_complement, 0)
            END
        ''')
    rule_cols = [row[1] for row in con.execute('PRAGMA table_info(merge_rules)')]
    if 'subject_sequence' not in rule_cols:
        con.execute('ALTER TABLE merge_rules ADD COLUMN subject_sequence TEXT')

def row_to_rule(con, row):
    fragments = []
    for frag in con.execute('''
        SELECT order_index, file_pattern, start_sequence, end_sequence,
               include_start, include_end, reverse_complement
        FROM fragment_rules
        WHERE rule_id = ?
        ORDER BY order_index
    ''', (row['id'],)):
        fragments.append({
            'order': frag['order_index'],
            'filePattern': frag['file_pattern'],
            'startSequence': frag['start_sequence'] or None,
            'endSequence': frag['end_sequence'] or None,
            'includeStart': bool(frag['include_start']),
            'includeEnd': bool(frag['include_end']),
            'reverseComplement': bool(frag['reverse_complement']),
        })
    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'] or None,
        'subjectSequence': row['subject_sequence'] or None,
        'fragments': fragments,
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
    }

def get_rule(con, rule_id):
    row = con.execute('SELECT * FROM merge_rules WHERE id = ?', (rule_id,)).fetchone()
    if not row:
        raise RuntimeError('Rule not found')
    return row_to_rule(con, row)

db_path.parent.mkdir(parents=True, exist_ok=True)
con = sqlite3.connect(db_path)
con.row_factory = sqlite3.Row
try:
    ensure_schema(con)
    if action == 'getRules':
        rules = [row_to_rule(con, row) for row in con.execute('SELECT * FROM merge_rules ORDER BY created_at DESC')]
        print(json.dumps(rules, ensure_ascii=False))
    elif action == 'saveRule':
        rule = payload
        fragments = rule.get('fragments') or []
        if rule.get('id'):
            con.execute('''
                UPDATE merge_rules
                SET name = ?, description = ?, subject_sequence = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (rule.get('name'), rule.get('description'), rule.get('subjectSequence'), rule.get('id')))
            con.execute('DELETE FROM fragment_rules WHERE rule_id = ?', (rule.get('id'),))
            rule_id = rule.get('id')
        else:
            cur = con.execute('''
                INSERT INTO merge_rules (name, description, subject_sequence)
                VALUES (?, ?, ?)
            ''', (rule.get('name'), rule.get('description'), rule.get('subjectSequence')))
            rule_id = cur.lastrowid
        for frag in fragments:
            con.execute('''
                INSERT INTO fragment_rules (
                  rule_id, order_index, file_pattern, start_sequence, end_sequence,
                  include_start, include_end, reverse_complement
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                rule_id,
                frag.get('order', 0),
                frag.get('filePattern') or '',
                frag.get('startSequence') or None,
                frag.get('endSequence') or None,
                1 if frag.get('includeStart') else 0,
                1 if frag.get('includeEnd') else 0,
                1 if frag.get('reverseComplement') else 0,
            ))
        con.commit()
        print(json.dumps(get_rule(con, rule_id), ensure_ascii=False))
    elif action == 'deleteRule':
        con.execute('DELETE FROM merge_rules WHERE id = ?', (payload.get('id'),))
        con.commit()
        print(json.dumps({'ok': True}, ensure_ascii=False))
finally:
    con.close()
`;

  const result = spawnSync('python', ['-c', script], {
    input,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Python dev API failed').trim());
  }

  return JSON.parse(result.stdout || 'null');
}
