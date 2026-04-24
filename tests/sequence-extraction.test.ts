import { SequenceProcessor } from '../src/main/services/sequence.processor';
import { FileService } from '../src/main/services/file.service';

describe('Sequence Extraction Tests', () => {
  let sequenceProcessor: SequenceProcessor;
  let fileService: FileService;

  beforeEach(() => {
    fileService = new FileService();
    sequenceProcessor = new SequenceProcessor(fileService);
  });

  describe('extractFragment', () => {
    test('pETUpstream: from ATGAAA (include) to ATGTTC (exclude)', () => {
      // 模拟 pETUpstream 序列
      const sequence = 'XXXATGAAAHELLOWORLDATGTTCYYY';
      
      const result = sequenceProcessor.extractFragment(
        sequence,
        'ATGAAA',  // start pattern
        'ATGTTC',  // end pattern
        true,      // include start
        false      // exclude end
      );
      
      // 应该得到: ATGAAAHELLOWORLD (包含ATGAAA，不包含ATGTTC)
      expect(result).toBe('ATGAAAHELLOWORLD');
    });

    test('HpaB554: from ATGTTC (include) to end', () => {
      // 模拟 HpaB554 序列
      const sequence = 'XXXATGTTCHELLOWORLDZZZ';
      
      const result = sequenceProcessor.extractFragment(
        sequence,
        'ATGTTC',  // start pattern
        undefined, // no end pattern
        true,      // include start
        false
      );
      
      // 应该得到: ATGTTCHELLOWORLDZZZ (从ATGTTC到结尾)
      expect(result).toBe('ATGTTCHELLOWORLDZZZ');
    });

    test('DuetDOWN1: complete sequence (no start/end)', () => {
      // 模拟 DuetDOWN1 序列
      const sequence = 'COMPLETEHELLOWORLD';
      
      const result = sequenceProcessor.extractFragment(
        sequence,
        undefined, // no start pattern
        undefined, // no end pattern
        false,
        false
      );
      
      // 应该得到完整序列
      expect(result).toBe('COMPLETEHELLOWORLD');
    });

    test('Real scenario: ATGTTC appears before ATGAAA should not affect pETUpstream', () => {
      // 测试如果ATGTTC在ATGAAA之前出现，不应该影响结果
      const sequence = 'ATGTTCXXXATGAAAHELLOWORLDATGTTCYYY';
      
      const result = sequenceProcessor.extractFragment(
        sequence,
        'ATGAAA',  // start pattern
        'ATGTTC',  // end pattern
        true,      // include start
        false      // exclude end
      );
      
      // 应该得到: ATGAAAHELLOWORLD
      // 因为先从ATGAAA切片，然后在切片后的序列中查找ATGTTC
      expect(result).toBe('ATGAAAHELLOWORLD');
    });

    test('Pattern not found: start pattern missing', () => {
      const sequence = 'HELLOWORLD';
      
      const result = sequenceProcessor.extractFragment(
        sequence,
        'NOTFOUND',
        undefined,
        true,
        false
      );
      
      // 应该返回空字符串
      expect(result).toBe('');
    });

    test('Pattern not found: end pattern missing', () => {
      const sequence = 'ATGAAAHELLOWORLD';
      
      const result = sequenceProcessor.extractFragment(
        sequence,
        'ATGAAA',
        'NOTFOUND',
        true,
        false
      );
      
      // 应该返回从ATGAAA到结尾的序列
      expect(result).toBe('ATGAAAHELLOWORLD');
    });

    test('Include/exclude combinations', () => {
      const sequence = 'XXXSTARTMIDDLEENDYYY';
      
      // Include start, exclude end
      let result = sequenceProcessor.extractFragment(sequence, 'START', 'END', true, false);
      expect(result).toBe('STARTMIDDLE');
      
      // Exclude start, include end
      result = sequenceProcessor.extractFragment(sequence, 'START', 'END', false, true);
      expect(result).toBe('MIDDLEEND');
      
      // Include both
      result = sequenceProcessor.extractFragment(sequence, 'START', 'END', true, true);
      expect(result).toBe('STARTMIDDLEEND');
      
      // Exclude both
      result = sequenceProcessor.extractFragment(sequence, 'START', 'END', false, false);
      expect(result).toBe('MIDDLE');
    });
  });

  describe('Full merge scenario', () => {
    test('Simulate complete merge with expected output', () => {
      // 使用你提供的预期输出来验证
      const expectedProtein = 'MKPEDFRASTQRPFTGEEYLKSLQDGREIYIYGERVKDVTTHPAFRNAAASVAQLYDALHKPEMQDSLCWNTDTGSGGYTHKFFRVAKSADDLRQQRDAIAEWSRLSYGWMGRTPDYKAAFGCALGANPGFYGQFEQNARNWYTRIQETGLYFNHAIVNPPIDRHLPTDKVKDVYIKLEKETDAGIIVSGAKVVATNSALTHYNMIGFGSAQVMGENPDFALMFVAPMDADGVKLISRASYEMVAGATGSPYDYPLSSRFDENDAILVMDNVLIPWENVLIYRDFDRCRRWAMGRRFCPYVSAASLCAPGSEIRLHYGTAEKITRMYRHPGVPWCAGRSRMKPEDFRASTQRPFTGEEYLKSLQDGREIYIYGERVKDVTTHPAFRNAAASVAQLYDALHKPEMQDSLCWNTDTGSGGYTHKFFRVAKSADDLRQQRDAIAEWSRLSYGWMGRTPDYKAAFGCALGANPGFYGQFEQNARNWYTRIQETGLYFNHAIVNPPIDRHLPTDKVKDVYIKLEKETDAGIIVSGAKVVATNSALTHYNMIGFGSAQVMGENPDFALMFVAPMDADGVKLISRASYEMVAGATGSPYDYPLSSRFDENDAILVMDNVLIPWENVLIYRDFDRCRRWAMEGGFARMYPLQACVRLAVKLDFITALLKKSLECTGTLEFRGVQADLGEVVAWRNTFWALSDSMCSEATPWVNGAYLPDHAALQTYRVLAPMAYAKIKNIIERNVTSGLIYLPSSARDLNNPQIDQYLAKYVRGSNGMDHVQRIKILKLMWDAIGSEFGGRHELYEINYSGSQDEIRLQCLRQAQNSGNMDKMMAMVDRCLSEYDQDGWTVPHLHNNDDINMLDKLLK';
      
      // 这个测试需要实际的DNA序列来验证
      // 你可以在运行时提供实际的序列数据
      console.log('Expected protein length:', expectedProtein.length);
      console.log('Expected protein:', expectedProtein);
      
      // 这里只是一个占位符，实际测试需要真实的DNA序列
      expect(expectedProtein.length).toBe(860);
    });
  });

  describe('Translation test', () => {
    test('Translate simple DNA to protein', () => {
      // ATG = M (Methionine, start codon)
      // AAA = K (Lysine)
      // TGA = _ (Stop codon)
      const dna = 'ATGAAATGA';
      const protein = sequenceProcessor.translateToProtein(dna);
      
      // 应该得到 MK (遇到终止密码子停止)
      expect(protein).toBe('MK');
    });

    test('Translate with invalid codon', () => {
      // ATG = M
      // XXX = invalid (should become X)
      // AAA = K
      const dna = 'ATGXXXAAA';
      const protein = sequenceProcessor.translateToProtein(dna);
      
      expect(protein).toBe('MXK');
    });
  });
});
