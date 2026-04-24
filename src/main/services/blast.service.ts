import https from 'https';
import type { BlastAlignment, BlastRequest, AlignmentGroup } from '../../shared/types';

/**
 * BLAST 配对比对服务。
 *
 * 这里不再走通用的 `Blast.cgi` 提交检索接口，而是尽量贴近旧版 Python 项目的实现：
 * 1. 先调用 `BlastAlign.cgi` 提交 BLAST 2 Sequences 请求；
 * 2. 再通过 `t2g.cgi` 轮询获取配对比对结果；
 * 3. 最后把返回的 HTML / 预格式化文本解析成前端和文档生成器能直接消费的数据结构。
 *
 * 这样做的原因是：
 * - 旧版 Python 输出就是基于这一套接口产生的；
 * - 当前迁移项目“结果和 Python 不一致”的最大来源之一，就是 BLAST 请求链路并没有真正按旧逻辑跑通；
 * - 统一接口后，后续排查就能把重点放回到序列拼接本身，而不是被比对服务差异干扰。
 */
export class BlastService {
  private readonly ALIGN_SUBMIT_URL = 'https://blast.ncbi.nlm.nih.gov/BlastAlign.cgi';
  private readonly ALIGN_FETCH_BASE_URL = 'https://blast.ncbi.nlm.nih.gov/t2g.cgi';
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly MAX_SUBMIT_RETRIES = 2;
  private readonly MAX_FETCH_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 1500;

  /**
   * 执行一次完整的蛋白序列配对比对。
   *
   * @param query 查询蛋白序列
   * @param subject 参考蛋白序列
   * @returns 解析后的 BLAST 结果
   */
  async compareSequences(query: string, subject: string): Promise<BlastAlignment> {
    this.assertSequence(query, 'query');
    this.assertSequence(subject, 'subject');

    const rid = await this.submitBlast({
      query: this.normalizeSequence(query),
      subject: this.normalizeSequence(subject),
    });

    const rawAlignment = await this.fetchAlignmentText(rid);
    return this.parseAlignmentText(rawAlignment);
  }

  /**
   * 提交 BLAST 2 Sequences 请求，返回 NCBI 分配的 RID。
   */
  async submitBlast(request: BlastRequest): Promise<string> {
    const params = new URLSearchParams({
      QUERY: request.query,
      SUBJECTS: request.subject,
      db: 'protein',
      BL2SEQ: 'on',
      stype: 'protein',
      FORMAT_OBJECT: 'Alignment',
      FORMAT_TYPE: 'HTML',
      ALIGNMENT_VIEW: 'Pairwise',
      CMD: 'request',
      PROGRAM: 'blastp',
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_SUBMIT_RETRIES; attempt++) {
      try {
        const html = await this.postForm(this.ALIGN_SUBMIT_URL, params.toString());
        const rid = this.extractRid(html);
        if (!rid) {
          throw new Error('BLAST 返回中未找到 RID');
        }
        return rid;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.MAX_SUBMIT_RETRIES) {
          await this.sleep(this.RETRY_DELAY_MS);
          continue;
        }
      }
    }

    throw new Error(`提交 BLAST 请求失败: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 轮询抓取配对比对的预格式化文本。
   *
   * 旧版 Python 最多尝试 3 次，并采用 1s / 1s / 4s 的等待节奏。
   * 这里保留“短轮询 + 少量重试”的策略，避免在网络抖动时直接失败。
   */
  async fetchAlignmentText(rid: string): Promise<string> {
    for (let attempt = 1; attempt <= this.MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const url = `${this.ALIGN_FETCH_BASE_URL}?CMD=Get&RID=${encodeURIComponent(rid)}`;
        const html = await this.getText(url);
        const alignmentText = this.extractAlignmentText(html);

        if (alignmentText) {
          return alignmentText;
        }

        if (attempt < this.MAX_FETCH_ATTEMPTS) {
          const delay = attempt * attempt * 1000;
          await this.sleep(delay);
          continue;
        }
      } catch (error) {
        if (attempt < this.MAX_FETCH_ATTEMPTS) {
          const delay = attempt * attempt * 1000;
          await this.sleep(delay);
          continue;
        }

        throw new Error(`获取 BLAST 比对结果失败: ${(error as Error).message}`);
      }
    }

    throw new Error('BLAST 比对结果在重试后仍未就绪');
  }

  /**
   * 把 NCBI 返回的纯文本比对内容转换成结构化结果。
   *
   * 这里特意保留了“统计信息 + 三行一组的 Query/Match/Sbjct 结构”，
   * 这样文档生成器可以最大程度还原旧版 Python 表格输出。
   */
  parseAlignmentText(preText: string): BlastAlignment {
    const normalizedText = preText.replace(/\r/g, '');
    const lines = normalizedText.split('\n');

    const statisticLines: string[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (line.startsWith('Query')) {
        break;
      }

      if (line.startsWith('Score') || line.startsWith('Identities') || line.includes('Expect')) {
        statisticLines.push(line);
      }
    }

    const score = this.pickStatistic(statisticLines, /^Score/i);
    const identities = this.pickStatistic(statisticLines, /^Identities/i);
    const expect = this.pickExpect(statisticLines);

    return {
      score: score || 'N/A',
      identities: identities || 'N/A',
      expect: expect || 'N/A',
      statisticLines,
      alignments: this.extractAlignmentGroups(lines),
    };
  }

  /**
   * 从统计信息行中提取某一项。
   */
  private pickStatistic(lines: string[], matcher: RegExp): string {
    const target = lines.find((line) => matcher.test(line));
    if (!target) {
      return '';
    }

    const parts = target.split('=');
    return parts.length > 1 ? parts.slice(1).join('=').trim() : target.trim();
  }

  /**
   * `Expect` 在旧版输出里可能和 `Score` 同行，所以单独解析。
   */
  private pickExpect(lines: string[]): string {
    for (const line of lines) {
      const match = line.match(/Expect(?:\(\d+\))?\s*=\s*([^,\s]+)/i);
      if (match) {
        return match[1].trim();
      }
    }

    return '';
  }

  /**
   * 解析 Query / Match / Sbjct 三行一组的比对块。
   */
  private extractAlignmentGroups(lines: string[]): AlignmentGroup[] {
    const groups: AlignmentGroup[] = [];

    for (let i = 0; i < lines.length; i++) {
      const queryLine = lines[i].trim();
      if (!queryLine.startsWith('Query')) {
        continue;
      }

      const queryMatch = queryLine.match(/^Query\s+(\d+)\s+([A-Z-]+)\s+(\d+)$/i);
      if (!queryMatch) {
        continue;
      }

      const matchLine = (lines[i + 1] || '').replace(/\r/g, '');
      const subjectLine = (lines[i + 2] || '').trim();
      const subjectMatch = subjectLine.match(/^Sbjct\s+(\d+)\s+([A-Z-]+)\s+(\d+)$/i);

      if (!subjectMatch) {
        continue;
      }

      groups.push({
        query: {
          start: Number(queryMatch[1]),
          sequence: queryMatch[2],
          end: Number(queryMatch[3]),
        },
        match: matchLine.trim(),
        subject: {
          start: Number(subjectMatch[1]),
          sequence: subjectMatch[2],
          end: Number(subjectMatch[3]),
        },
      });

      i += 2;
    }

    return groups;
  }

  /**
   * 从提交响应 HTML 中提取 RID。
   */
  private extractRid(html: string): string | null {
    const tableMatch = html.match(/Request ID[\s\S]*?<b>\s*([A-Z0-9-]+)\s*<\/b>/i);
    if (tableMatch) {
      return tableMatch[1].trim();
    }

    const fallbackMatch = html.match(/\bRID\s*=?\s*([A-Z0-9-]{6,})/i);
    return fallbackMatch ? fallbackMatch[1].trim() : null;
  }

  /**
   * 从结果页中提取 `<div id="alignments">` 里的 `<pre>` 文本。
   */
  private extractAlignmentText(html: string): string | null {
    const divPreMatch = html.match(
      /<div[^>]*id=["']alignments["'][^>]*>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i,
    );

    if (divPreMatch) {
      return this.decodeHtml(divPreMatch[1]).trim();
    }

    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
      return this.decodeHtml(preMatch[1]).trim();
    }

    return null;
  }

  /**
   * 发送表单 POST 请求。
   */
  private postForm(url: string, postData: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: 'POST',
          timeout: this.DEFAULT_TIMEOUT,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
              return;
            }

            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Unknown error'}`));
          });
        },
      );

      req.on('error', (error) => {
        reject(this.normalizeNetworkError(error));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`请求超时，超过 ${this.DEFAULT_TIMEOUT}ms`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * 发送 GET 请求。
   */
  private getText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          timeout: this.DEFAULT_TIMEOUT,
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            Referer: this.ALIGN_SUBMIT_URL,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
              return;
            }

            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Unknown error'}`));
          });
        },
      );

      req.on('error', (error) => {
        reject(this.normalizeNetworkError(error));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`请求超时，超过 ${this.DEFAULT_TIMEOUT}ms`));
      });
    });
  }

  /**
   * 对输入序列做最小清洗，避免换行和空白影响提交。
   */
  private normalizeSequence(sequence: string): string {
    return sequence.replace(/\s+/g, '').toUpperCase();
  }

  /**
   * 对用户或上游传来的序列做基础校验。
   */
  private assertSequence(sequence: string, label: 'query' | 'subject'): void {
    if (!sequence || !sequence.trim()) {
      throw new Error(`${label} sequence cannot be empty`);
    }
  }

  /**
   * 把常见 HTML 实体还原成可解析文本。
   */
  private decodeHtml(html: string): string {
    return html
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"');
  }

  /**
   * 标准化网络错误文案，便于前端统一提示。
   */
  private normalizeNetworkError(error: Error): Error {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND') {
      return new Error('Network error: Cannot reach NCBI BLAST server. Please check your internet connection.');
    }
    if (code === 'ECONNREFUSED') {
      return new Error('Network error: Connection refused by NCBI BLAST server.');
    }
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      return new Error('Network error: Connection timeout when contacting NCBI BLAST server.');
    }

    return new Error(`Network error: ${error.message}`);
  }

  /**
   * 简单延时工具，用于轮询等待。
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
