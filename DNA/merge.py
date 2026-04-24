def read_seq(filepath):
    """读取.seq文件，忽略头部，只保留纯序列"""
    with open(filepath, "r") as f:
        lines = f.readlines()
    seq = "".join(line.strip() for line in lines if not line.startswith(">"))
    return seq


def merge_group(files, group_name):
    """拼接每组的DNA序列"""
    seqs = {}
    for f in files:
        if "pETUpstream" in f:
            seqs["pETUpstream"] = read_seq(f)
        elif "HpaB554" in f:
            seqs["HpaB554"] = read_seq(f)
        elif "DuetDOWN1" in f:
            seqs["DuetDOWN1"] = read_seq(f)

    # 检查缺失
    required = ["pETUpstream", "HpaB554", "DuetDOWN1"]
    for r in required:
        if r not in seqs:
            print(f"⚠️ 组 {group_name} 缺少 {r} 文件")
            seqs[r] = ""

    # 处理 pETUpstream
    pet_seq = seqs["pETUpstream"]
    start = pet_seq.find("ATGAAA")
    if start != -1:
        pet_seq = pet_seq[start:]  # 去掉 ATGAAA 之前
    end = pet_seq.find("ATGTTC")
    if end != -1:
        pet_seq = pet_seq[:end]  # 去掉 ATGTTC 及之后

    # 处理 HpaB554
    hpa_seq = seqs["HpaB554"]
    start = hpa_seq.find("ATGTTC")
    if start != -1:
        hpa_seq = hpa_seq[start:]  # 保留 ATGTTC 及之后

    # 拼接
    duet_seq = seqs["DuetDOWN1"]
    final_seq = pet_seq + hpa_seq + duet_seq
    return final_seq
