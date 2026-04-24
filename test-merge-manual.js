"use strict";
/**
 * 手动测试脚本 - 直接从文件路径读取并测试序列拼接
 *
 * 使用方法：
 * 1. 修改下面的 TEST_FILES 数组，填入你的 .seq 文件路径
 * 2. 运行: npx ts-node test-merge-manual.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
// ==================== 配置区域 ====================
// 在这里填入你的测试文件路径
var TEST_FILES = [
    'C:\\Users\\21017\\Desktop\\张翀_2270287470_测序结果\\张翀_2270287470_测序结果\\0002_32725041600027_(T292A-1)_[pETUpstream].seq',
    'C:\\Users\\21017\\Desktop\\张翀_2270287470_测序结果\\张翀_2270287470_测序结果\\0003_32725041600027_(T292A-1)_[HpaB554].seq',
    'C:\\Users\\21017\\Desktop\\张翀_2270287470_测序结果\\张翀_2270287470_测序结果\\0001_32725041600027_(T292A-1)_[DuetDOWN1].seq',
];
// 拼接规则配置（与数据库中的规则一致）
var MERGE_RULES = {
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
var EXPECTED_PROTEIN = 'MKPEDFRASTQRPFTGEEYLKSLQDGREIYIYGERVKDVTTHPAFRNAAASVAQLYDALHKPEMQDSLCWNTDTGSGGYTHKFFRVAKSADDLRQQRDAIAEWSRLSYGWMGRTPDYKAAFGCALGANPGFYGQFEQNARNWYTRIQETGLYFNHAIVNPPIDRHLPTDKVKDVYIKLEKETDAGIIVSGAKVVATNSALTHYNMIGFGSAQVMGENPDFALMFVAPMDADGVKLISRASYEMVAGATGSPYDYPLSSRFDENDAILVMDNVLIPWENVLIYRDFDRCRRWAMGRRFCPYVSAASLCAPGSEIRLHYGTAEKITRMYRHPGVPWCAGRSRMKPEDFRASTQRPFTGEEYLKSLQDGREIYIYGERVKDVTTHPAFRNAAASVAQLYDALHKPEMQDSLCWNTDTGSGGYTHKFFRVAKSADDLRQQRDAIAEWSRLSYGWMGRTPDYKAAFGCALGANPGFYGQFEQNARNWYTRIQETGLYFNHAIVNPPIDRHLPTDKVKDVYIKLEKETDAGIIVSGAKVVATNSALTHYNMIGFGSAQVMGENPDFALMFVAPMDADGVKLISRASYEMVAGATGSPYDYPLSSRFDENDAILVMDNVLIPWENVLIYRDFDRCRRWAMEGGFARMYPLQACVRLAVKLDFITALLKKSLECTGTLEFRGVQADLGEVVAWRNTFWALSDSMCSEATPWVNGAYLPDHAALQTYRVLAPMAYAKIKNIIERNVTSGLIYLPSSARDLNNPQIDQYLAKYVRGSNGMDHVQRIKILKLMWDAIGSEFGGRHELYEINYSGSQDEIRLQCLRQAQNSGNMDKMMAMVDRCLSEYDQDGWTVPHLHNNDDINMLDKLLK';
// ==================== 工具函数 ====================
/**
 * 遗传密码表
 */
var CODON_TABLE = {
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
    console.log("\n\uD83D\uDCD6 \u8BFB\u53D6\u6587\u4EF6: ".concat(filePath));
    if (!fs.existsSync(filePath)) {
        throw new Error("\u6587\u4EF6\u4E0D\u5B58\u5728: ".concat(filePath));
    }
    var content = fs.readFileSync(filePath, 'utf-8');
    var lines = content.split('\n');
    // 过滤掉以 > 开头的行（FASTA 头部）
    var sequenceLines = lines.filter(function (line) { return !line.trim().startsWith('>'); });
    // 合并所有序列行，去除空格和换行符
    var sequence = sequenceLines.join('').replace(/\s/g, '').toUpperCase();
    console.log("   \u2713 \u5E8F\u5217\u957F\u5EA6: ".concat(sequence.length, " bp"));
    console.log("   \u2713 \u524D30\u4E2A\u78B1\u57FA: ".concat(sequence.substring(0, 30), "..."));
    console.log("   \u2713 \u540E30\u4E2A\u78B1\u57FA: ...".concat(sequence.substring(sequence.length - 30)));
    return sequence;
}
/**
 * 从文件名解析模式名
 */
function parsePattern(filePath) {
    var filename = path.basename(filePath);
    // 从方括号中提取模式
    var bracketMatch = filename.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
        return bracketMatch[1].trim();
    }
    throw new Error("\u65E0\u6CD5\u4ECE\u6587\u4EF6\u540D\u89E3\u6790\u6A21\u5F0F: ".concat(filename));
}
/**
 * 从文件名解析组名
 */
function parseGroup(filePath) {
    var filename = path.basename(filePath);
    // 从圆括号中提取组名
    var groupMatch = filename.match(/\(([^)]+)\)/);
    if (groupMatch) {
        return "(".concat(groupMatch[1], ")");
    }
    return 'Unknown';
}
/**
 * 提取序列片段（模拟 Python 的切片行为）
 */
function extractFragment(sequence, startPattern, endPattern, includeStart, includeEnd) {
    if (includeStart === void 0) { includeStart = false; }
    if (includeEnd === void 0) { includeEnd = false; }
    var workingSequence = sequence;
    // 处理起始标记 - 先切片序列
    if (startPattern) {
        var startPos = workingSequence.indexOf(startPattern);
        if (startPos === -1) {
            console.log("   \u26A0\uFE0F  \u672A\u627E\u5230\u8D77\u59CB\u6807\u8BB0: ".concat(startPattern));
            return '';
        }
        if (includeStart) {
            workingSequence = workingSequence.substring(startPos);
        }
        else {
            workingSequence = workingSequence.substring(startPos + startPattern.length);
        }
    }
    // 处理结束标记 - 在已切片的序列中查找
    if (endPattern) {
        var endPos = workingSequence.indexOf(endPattern);
        if (endPos === -1) {
            console.log("   \u26A0\uFE0F  \u672A\u627E\u5230\u7ED3\u675F\u6807\u8BB0: ".concat(endPattern, "\uFF0C\u4F7F\u7528\u6574\u4E2A\u5207\u7247\u540E\u7684\u5E8F\u5217"));
        }
        else {
            if (includeEnd) {
                workingSequence = workingSequence.substring(0, endPos + endPattern.length);
            }
            else {
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
    var sequence = dnaSequence.toUpperCase();
    var protein = '';
    for (var i = 0; i < sequence.length - 2; i += 3) {
        var codon = sequence.substring(i, i + 3);
        var aminoAcid = CODON_TABLE[codon];
        if (aminoAcid === '_') {
            // 遇到终止密码子，停止翻译
            break;
        }
        else if (aminoAcid) {
            protein += aminoAcid;
        }
        else {
            // 无效密码子
            protein += 'X';
        }
    }
    return protein;
}
// ==================== 主程序 ====================
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var fileData, _i, TEST_FILES_1, filePath, pattern, group, sequence, fragments, order, _loop_1, _a, order_1, patternName, mergedDNA, proteinSequence, i, i;
        var _b;
        return __generator(this, function (_c) {
            console.log('='.repeat(80));
            console.log('🧬 DNA 序列拼接测试');
            console.log('='.repeat(80));
            try {
                // 1. 读取所有文件
                console.log('\n📂 步骤 1: 读取文件');
                fileData = [];
                for (_i = 0, TEST_FILES_1 = TEST_FILES; _i < TEST_FILES_1.length; _i++) {
                    filePath = TEST_FILES_1[_i];
                    pattern = parsePattern(filePath);
                    group = parseGroup(filePath);
                    sequence = readSeqFile(filePath);
                    fileData.push({ pattern: pattern, sequence: sequence, group: group });
                }
                // 2. 按照规则顺序处理每个片段
                console.log('\n🔧 步骤 2: 提取并拼接片段');
                fragments = [];
                order = ['pETUpstream', 'HpaB554', 'DuetDOWN1'];
                _loop_1 = function (patternName) {
                    console.log("\n--- \u5904\u7406 ".concat(patternName, " ---"));
                    var file = fileData.find(function (f) { return f.pattern === patternName; });
                    if (!file) {
                        console.log("   \u274C \u672A\u627E\u5230\u6587\u4EF6");
                        return "continue";
                    }
                    var rule = MERGE_RULES[patternName];
                    var fragment = extractFragment(file.sequence, rule.startPattern, rule.endPattern, rule.includeStart, rule.includeEnd);
                    if (fragment) {
                        console.log("   \u2713 \u63D0\u53D6\u6210\u529F\uFF0C\u7247\u6BB5\u957F\u5EA6: ".concat(fragment.length, " bp"));
                        console.log("   \u2713 \u7247\u6BB5\u5F00\u5934: ".concat(fragment.substring(0, 30), "..."));
                        console.log("   \u2713 \u7247\u6BB5\u7ED3\u5C3E: ...".concat(fragment.substring(fragment.length - 30)));
                        fragments.push({ pattern: patternName, fragment: fragment });
                    }
                    else {
                        console.log("   \u274C \u63D0\u53D6\u5931\u8D25");
                    }
                };
                for (_a = 0, order_1 = order; _a < order_1.length; _a++) {
                    patternName = order_1[_a];
                    _loop_1(patternName);
                }
                // 3. 拼接所有片段
                console.log('\n🔗 步骤 3: 拼接所有片段');
                mergedDNA = fragments.map(function (f) { return f.fragment; }).join('');
                console.log("   \u2713 \u62FC\u63A5\u540E\u7684 DNA \u5E8F\u5217\u957F\u5EA6: ".concat(mergedDNA.length, " bp"));
                console.log("   \u2713 DNA \u5F00\u5934: ".concat(mergedDNA.substring(0, 60), "..."));
                console.log("   \u2713 DNA \u7ED3\u5C3E: ...".concat(mergedDNA.substring(mergedDNA.length - 60)));
                // 4. 翻译为蛋白质序列
                console.log('\n🧪 步骤 4: 翻译为蛋白质序列');
                proteinSequence = translateToProtein(mergedDNA);
                console.log("   \u2713 \u86CB\u767D\u8D28\u5E8F\u5217\u957F\u5EA6: ".concat(proteinSequence.length, " aa"));
                console.log("   \u2713 \u86CB\u767D\u8D28\u5E8F\u5217:");
                // 每行显示 80 个氨基酸
                for (i = 0; i < proteinSequence.length; i += 80) {
                    console.log("      ".concat(proteinSequence.substring(i, i + 80)));
                }
                // 5. 与预期结果比较
                console.log('\n✅ 步骤 5: 验证结果');
                if (proteinSequence === EXPECTED_PROTEIN) {
                    console.log('   🎉 完美！结果与预期完全一致！');
                }
                else {
                    console.log('   ⚠️  结果与预期不一致');
                    console.log("   \u9884\u671F\u957F\u5EA6: ".concat(EXPECTED_PROTEIN.length, " aa"));
                    console.log("   \u5B9E\u9645\u957F\u5EA6: ".concat(proteinSequence.length, " aa"));
                    // 找出第一个不同的位置
                    for (i = 0; i < Math.max(proteinSequence.length, EXPECTED_PROTEIN.length); i++) {
                        if (proteinSequence[i] !== EXPECTED_PROTEIN[i]) {
                            console.log("   \u7B2C\u4E00\u4E2A\u5DEE\u5F02\u4F4D\u7F6E: ".concat(i));
                            console.log("   \u9884\u671F: ".concat(EXPECTED_PROTEIN.substring(Math.max(0, i - 10), i + 10)));
                            console.log("   \u5B9E\u9645: ".concat(proteinSequence.substring(Math.max(0, i - 10), i + 10)));
                            break;
                        }
                    }
                }
                // 6. 输出详细信息
                console.log('\n📊 详细信息:');
                console.log("   \u7EC4\u540D: ".concat(((_b = fileData[0]) === null || _b === void 0 ? void 0 : _b.group) || 'Unknown'));
                console.log("   \u5904\u7406\u7684\u6587\u4EF6\u6570: ".concat(TEST_FILES.length));
                console.log("   \u6210\u529F\u63D0\u53D6\u7684\u7247\u6BB5\u6570: ".concat(fragments.length));
                console.log("   DNA \u603B\u957F\u5EA6: ".concat(mergedDNA.length, " bp"));
                console.log("   \u86CB\u767D\u8D28\u957F\u5EA6: ".concat(proteinSequence.length, " aa"));
                console.log('\n' + '='.repeat(80));
                console.log('✅ 测试完成！');
                console.log('='.repeat(80));
            }
            catch (error) {
                console.error('\n❌ 错误:', error);
                process.exit(1);
            }
            return [2 /*return*/];
        });
    });
}
// 运行主程序
main();
