# 遗传密码表（DNA，T/U都行）
CODON_TABLE = {
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
    'TAC': 'Y', 'TAT': 'Y', 'TAA': '_', 'TAG': '_',  # _ 表示终止
    'TGC': 'C', 'TGT': 'C', 'TGA': '_', 'TGG': 'W',
}




def translate_dna_to_protein(dna_seq: str) -> str:
    """将DNA序列翻译成蛋白质"""
    dna_seq = dna_seq.upper().replace("U", "T")  # 把RNA里的U替换成T
    protein = []
    for i in range(0, len(dna_seq) - 2, 3):  # 每3个碱基一个密码子
        codon = dna_seq[i:i + 3]
        amino_acid = CODON_TABLE.get(codon, 'X')  # X表示未知/错误
        if amino_acid == '_':  # 遇到终止密码子就停
            break
        protein.append(amino_acid)
    return ''.join(protein)