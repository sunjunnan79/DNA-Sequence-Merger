/**
 * 手动测试脚本 - 直接从文件路径读取并测试序列拼接
 * 
 * 使用方法：
 * 1. 修改下面的 TEST_FILES 数组，填入你的 .seq 文件路径
 * 2. 运行: node test-merge-manual.cjs
 */

const fs = require('fs');
const path = require('path');

// ==================== 配置区域 ====================
// 在这里填入你的测试文件路径
const TEST_FILES = [
  'C:\\Users\\21017\\Desktop\\张翀_2270287470_测序结果\\张翀_2270287470_测序结果\\0002_32725041600027_(T292A-1)_[pETUpstream].seq',
  'C:\\Users\\21017\\Desktop\\张翀_2270287470_测序结果\\张翀_2270287470_测序结果\\0003_32725041600027_(T292A-1)_[HpaB554].seq',
  'C:\\Users\\21017\\Desktop\\张翀_2270287470_测序结果\\张翀_2270287470_测序结果\\0001_32725041600027_(T292A-1)_[DuetDOWN1].seq',
];

// 拼接规则配置（与数据库中的规则一致）
const MERGE_RULES = {
  pETUpstream: {
    startPattern: 'ATGAAA',
    endPattern: 'ATGTTC',
    includeStart: true,
    includeEnd: false,
  },
  HpaB554: {
    startPattern: 'ATGTTC',
    endPattern: undefined,
    includeStart: true,
    includeEnd: false,
  },
  DuetDOWN1: {
    startPattern: undefined,
    endPattern: undefined,
    includeStart: false,
    includeEnd: false,
  },
};

// 预期的蛋白质序列（用于验证）
const EXPECTED_PROTEIN = 'MKPEDFRASTQRPFTGEEYLKSLQDGREIYIYGERVKDVTTHPAFRNAAASVAQLYDALHKPEMQDSLCWNTDTGSGGYTHKFFRVAKSADDLRQQRDAIAEWSRLSYGWMGRTPDYKAAFGCALGANPGFYGQFEQNARNWYTRIQETGLYFNHAIVNPPIDRHLPTDKVKDVYIKLEKETDAGIIVSGAKVVATNSALTHYNMIGFGSAQVMGENPDFALMFVAPMDADGVKLISRASYEMVAGATGSPYDYPLSSRFDENDAILVMDNVLIPWENVLIYRDFDRCRRWAMGRRFCPYVSAASLCAPGSEIRLHYGTAEKITRMYRHPGVPWCAGRSRMKPEDFRASTQRPFTGEEYLKSLQDGREIYIYGERVKDVTTHPAFRNAAASVAQLYDALHKPEMQDSLCWNTDTGSGGYTHKFFRVAKSADDLRQQRDAIAEWSRLSYGWMGRTPDYKAAFGCALGANPGFYGQFEQNARNWYTRIQETGLYFNHAIVNPPIDRHLPTDKVKDVYIKLEKETDAGIIVSGAKVVATNSALTHYNMIGFGSAQVMGENPDFALMFVAPMDADGVKLISRASYEMVAGATGSPYDYPLSSRFDENDAILVMDNVLIPWENVLIYRDFDRCRRWAMEGGFARMYPLQACVRLAVKLDFITALLKKSLECTGTLEFRGVQADLGEVVAWRNTFWALSDSMCSEATPWVNGAYLPDHAALQTYRVLAPMAYAKIKNIIERNVTSGLIYLPSSARDLNNPQIDQYLAKYVRGSNGMDHVQRIKILKLMWDAIGSEFGGRHELYEINYSGSQDEIRLQCLRQAQNSGNMDKMMAMVDRCLSEYDQDGWTVPHLHNNDDINMLDKLLK';

// ==================== 工具函数 ====================

/**
 * 遗传密码表
 */
const CODON_TABLE = {
  'ATA': 'I', 'ATC': 'I', 'ATT': 'I', 'ATG': 'M',
  'ACA': 'T', 'ACC': 'T', 'ACG': 'T', 'ACT': 'T',
  'AAC': 'N', 'AAT': 'N', 'AAA': 'K', 'AAG': 'K',
  'AGC': 'S', 'AGT': 'S', 'AGA': 'R', 'AGG': 'R',
  'CTA': 'L', 'CTC': 'L', 'CTG': 'L', 'CTT': 'L',
  'CCA': 'P', 'CCC': 'P', 'CCG': 'P', 'CCT': 'P',
  'CAC': 'H', 'CAT': 'H', 'CAA': 'Q', 'CAG': 'Q',
  'CGA': 'R', 'CGC': 'R', 'CGG': 'R', 'CGT': 'R',
  'GTA': 'V', 'GTC': 'V', 'GTG': 'V', 'GTT': 'V',
  'GCA': 'A', 'GCC': 'A', 'GCG': 'A', 'GCT': 'A',
  'GAC': 'D', 'GAT': 'D', 'GAA': 'E', 'GAG': 'E',
  'GGA': 'G', 'GGC': 'G', 'GGG': 'G', 'GGT': 'G',
  'TCA': 'S', 'TCC': 'S', 'TCG': 'S', 'TCT': 'S',
  'TTC': 'F', 'TTT': 'F', 'TTA': 'L', 'TTG': 'L',
  'TAC': 'Y', 'TAT': 'Y', 'TAA': '_', 'TAG': '_',
  'TGC': 'C', 'TGT': 'C', 'TGA': '_', 'TGG': 'W',
};

/**
 * 读取 .seq 文件
 */
function readSeqFile(filePath) {
  console.log(`\n📖 读取文件: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // 过滤掉以 > 开头的行（FASTA 头部）
  const sequenceLines = lines.filter(line => !line.trim().startsWith('>'));
  
  // 合并所有序列行，去除空格和换行符
  const sequence = sequenceLines.join('').replace(/\s/g, '').toUpperCase();
  
  console.log(`   ✓ 序列长度: ${sequence.length} bp`);
  console.log(`   ✓ 前30个碱基: ${sequence.substring(0, 30)}...`);
  console.log(`   ✓ 后30个碱基: ...${sequence.substring(sequence.length - 30)}`);
  
  return sequence;
}

/**
 * 从文件名解析模式名
 */
function parsePattern(filePath) {
  const filename = path.basename(filePath);
  
  // 从方括号中提取模式
  const bracketMatch = filename.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }
  
  throw new Error(`无法从文件名解析模式: ${filename}`);
}

/**
 * 从文件名解析组名
 */
function parseGroup(filePath) {
  const filename = path.basename(filePath);
  
  // 从圆括号中提取组名
  const groupMatch = filename.match(/\(([^)]+)\)/);
  if (groupMatch) {
    return `(${groupMatch[1]})`;
  }
  
  return 'Unknown';
}

/**
 * 提取序列片段（模拟 Python 的切片行为）
 */
function extractFragment(sequence, startPattern, endPattern, includeStart = false, includeEnd = false) {
  let workingSequence = sequence;

  // 处理起始标记 - 先切片序列
  if (startPattern) {
    const startPos = workingSequence.indexOf(startPattern);
    
    if (startPos === -1) {
      console.log(`   ⚠️  未找到起始标记: ${startPattern}`);
      return '';
    }
    
    if (includeStart) {
      workingSequence = workingSequence.substring(startPos);
    } else {
      workingSequence = workingSequence.substring(startPos + startPattern.length);
    }
  }

  // 处理结束标记 - 在已切片的序列中查找
  if (endPattern) {
    const endPos = workingSequence.indexOf(endPattern);
    
    if (endPos === -1) {
      console.log(`   ⚠️  未找到结束标记: ${endPattern}，使用整个切片后的序列`);
    } else {
      if (includeEnd) {
        workingSequence = workingSequence.substring(0, endPos + endPattern.length);
      } else {
        workingSequence = workingSequence.substring(0, endPos);
      }
    }
  }

  return workingSequence;
}

/**
 * 翻译 DNA 序列为蛋白质序列
 */
function translateToProtein(dnaSequence) {
  const sequence = dnaSequence.toUpperCase();
  let protein = '';

  for (let i = 0; i < sequence.length - 2; i += 3) {
    const codon = sequence.substring(i, i + 3);
    const aminoAcid = CODON_TABLE[codon];
    
    if (aminoAcid === '_') {
      // 遇到终止密码子，停止翻译
      break;
    } else if (aminoAcid) {
      protein += aminoAcid;
    } else {
      // 无效密码子
      protein += 'X';
    }
  }

  return protein;
}

// ==================== 主程序 ====================

async function main() {
  console.log('='.repeat(80));
  console.log('🧬 DNA 序列拼接测试');
  console.log('='.repeat(80));

  try {
    // 1. 读取所有文件
    console.log('\n📂 步骤 1: 读取文件');
    const fileData = [];
    
    for (const filePath of TEST_FILES) {
      const pattern = parsePattern(filePath);
      const group = parseGroup(filePath);
      const sequence = readSeqFile(filePath);
      
      fileData.push({ pattern, sequence, group });
    }

    // 2. 按照规则顺序处理每个片段
    console.log('\n🔧 步骤 2: 提取并拼接片段');
    const fragments = [];
    const order = ['pETUpstream', 'HpaB554', 'DuetDOWN1'];
    
    for (const patternName of order) {
      console.log(`\n--- 处理 ${patternName} ---`);
      
      const file = fileData.find(f => f.pattern === patternName);
      if (!file) {
        console.log(`   ❌ 未找到文件`);
        continue;
      }
      
      const rule = MERGE_RULES[patternName];
      const fragment = extractFragment(
        file.sequence,
        rule.startPattern,
        rule.endPattern,
        rule.includeStart,
        rule.includeEnd
      );
      
      if (fragment) {
        console.log(`   ✓ 提取成功，片段长度: ${fragment.length} bp`);
        console.log(`   ✓ 片段开头: ${fragment.substring(0, 30)}...`);
        console.log(`   ✓ 片段结尾: ...${fragment.substring(fragment.length - 30)}`);
        fragments.push({ pattern: patternName, fragment });
      } else {
        console.log(`   ❌ 提取失败`);
      }
    }
    console.log("测试的")
    console.log(fragments)
    // 3. 拼接所有片段
    console.log('\n🔗 步骤 3: 拼接所有片段');
    const mergedDNA = fragments.map(f => f.fragment).join('');
    console.log(`   ✓ 拼接后的 DNA 序列长度: ${mergedDNA.length} bp`);
    console.log(`   ✓ DNA 开头: ${mergedDNA.substring(0, 60)}...`);
    console.log(`   ✓ DNA 结尾: ...${mergedDNA.substring(mergedDNA.length - 60)}`);

    // 4. 翻译为蛋白质序列
    console.log('\n🧪 步骤 4: 翻译为蛋白质序列');
    const proteinSequence = translateToProtein(mergedDNA);
    console.log(`   ✓ 蛋白质序列长度: ${proteinSequence.length} aa`);
    console.log(`   ✓ 蛋白质序列:`);
    
    // 每行显示 80 个氨基酸
    for (let i = 0; i < proteinSequence.length; i += 80) {
      console.log(`      ${proteinSequence.substring(i, i + 80)}`);
    }

    // 5. 与预期结果比较
    console.log('\n✅ 步骤 5: 验证结果');
    if (proteinSequence === EXPECTED_PROTEIN) {
      console.log('   🎉 完美！结果与预期完全一致！');
    } else {
      console.log('   ⚠️  结果与预期不一致');
      console.log(`   预期长度: ${EXPECTED_PROTEIN.length} aa`);
      console.log(`   实际长度: ${proteinSequence.length} aa`);
      
      // 找出第一个不同的位置
      for (let i = 0; i < Math.max(proteinSequence.length, EXPECTED_PROTEIN.length); i++) {
        if (proteinSequence[i] !== EXPECTED_PROTEIN[i]) {
          console.log(`   第一个差异位置: ${i}`);
          console.log(`   预期: ${EXPECTED_PROTEIN.substring(Math.max(0, i - 10), i + 10)}`);
          console.log(`   实际: ${proteinSequence.substring(Math.max(0, i - 10), i + 10)}`);
          break;
        }
      }
    }

    // 6. 输出详细信息
    console.log('\n📊 详细信息:');
    console.log(`   组名: ${fileData[0]?.group || 'Unknown'}`);
    console.log(`   处理的文件数: ${TEST_FILES.length}`);
    console.log(`   成功提取的片段数: ${fragments.length}`);
    console.log(`   DNA 总长度: ${mergedDNA.length} bp`);
    console.log(`   蛋白质长度: ${proteinSequence.length} aa`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ 测试完成！');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主程序
main();
