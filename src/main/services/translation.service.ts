import https from 'https';

export interface TranslationFrame {
  strand: 'forward' | 'reverse';
  frame: number;
  proteinSequence: string;
}

export interface TranslationService {
  translate(dnaSequence: string): Promise<TranslationFrame[]>;
}

export type CodonTranslator = (dnaSequence: string, frame: number) => string;

/**
 * Expasy Translate 官方程序接口封装。
 *
 * 页面入口是 https://web.expasy.org/translate/，
 * 官方 programmatic access 指向 `dna2aa.cgi`，POST 裸 DNA 序列后返回 FASTA。
 * 返回内容包含 3'5' 和 5'3' 共 6 个阅读框，终止密码子在 compact FASTA 中用 `-` 表示。
 */
export class ExpasyTranslationService implements TranslationService {
  private readonly TRANSLATE_URL = 'https://web.expasy.org/cgi-bin/translate/dna2aa.cgi';
  private readonly DEFAULT_TIMEOUT = 30000;

  async translate(dnaSequence: string): Promise<TranslationFrame[]> {
    const normalizedSequence = dnaSequence.replace(/\s+/g, '').toUpperCase();
    if (!normalizedSequence) {
      return [];
    }

    const responseText = await this.postForm(
      new URLSearchParams({
        dna_sequence: normalizedSequence,
        output_format: 'fasta',
      }).toString(),
    );

    return this.parseFastaFrames(responseText);
  }

  /**
   * 解析 Expasy FASTA。
   *
   * 典型标题形如：
   * `> VIRT-2119284:5'3' Frame 2`
   * 其中 5'3' 表示当前 DNA 方向，3'5' 表示反向链。
   */
  parseFastaFrames(fastaText: string): TranslationFrame[] {
    const frames: TranslationFrame[] = [];
    let currentHeader = '';
    let currentSequence = '';

    const flush = () => {
      if (!currentHeader) {
        return;
      }

      const headerMatch = currentHeader.match(/:(3'5'|5'3')\s+Frame\s+([123])/i);
      if (!headerMatch) {
        currentHeader = '';
        currentSequence = '';
        return;
      }

      frames.push({
        strand: headerMatch[1] === "5'3'" ? 'forward' : 'reverse',
        frame: Number(headerMatch[2]) - 1,
        proteinSequence: currentSequence.replace(/\s+/g, '').toUpperCase(),
      });

      currentHeader = '';
      currentSequence = '';
    };

    for (const rawLine of fastaText.replace(/\r/g, '').split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (line.startsWith('>')) {
        flush();
        currentHeader = line;
        continue;
      }

      currentSequence += line;
    }

    flush();
    return frames;
  }

  private postForm(postData: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        this.TRANSLATE_URL,
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

            reject(new Error(`Expasy Translate HTTP ${res.statusCode}: ${res.statusMessage || 'Unknown error'}`));
          });
        },
      );

      req.on('error', (error) => {
        reject(new Error(`Expasy Translate network error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Expasy Translate 请求超时，超过 ${this.DEFAULT_TIMEOUT}ms`));
      });

      req.write(postData);
      req.end();
    });
  }
}

/**
 * 本地翻译服务，主要用于单元测试以及 Expasy 网络不可用时的兜底。
 */
export class LocalTranslationService implements TranslationService {
  constructor(private readonly translateCodons: CodonTranslator) {}

  async translate(dnaSequence: string): Promise<TranslationFrame[]> {
    return [0, 1, 2].map((frame) => ({
      strand: 'forward',
      frame,
      proteinSequence: this.translateCodons(dnaSequence, frame),
    }));
  }
}
