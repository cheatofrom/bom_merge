import pandas as pd
from db import get_connection
import numpy as np
import tempfile
import os

def import_excel_to_db(file_stream, upload_batch, project_name):
    # 创建一个临时文件来解决SpooledTemporaryFile的兼容性问题
    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
        # 将上传的文件内容写入临时文件
        file_stream.seek(0)
        tmp.write(file_stream.read())
        tmp_path = tmp.name

    try:
        # 使用临时文件路径读取Excel，并指定读取"BOM"工作表
        xls = pd.ExcelFile(tmp_path)
        
        # 查找名为"BOM"的工作表（忽略前后空格）
        bom_sheet = None
        for sheet_name in xls.sheet_names:
            if sheet_name.strip().upper() == "BOM":
                bom_sheet = sheet_name
                break
        
        # 如果找不到"BOM"工作表，尝试使用第三个工作表（索引为2）
        if not bom_sheet and len(xls.sheet_names) >= 3:
            bom_sheet = xls.sheet_names[2]  # 第三个表（索引从0开始）
        elif not bom_sheet and len(xls.sheet_names) > 0:
            # 如果没有第三个表，使用第一个表
            bom_sheet = xls.sheet_names[0]
        
        # 读取指定的工作表
        df = pd.read_excel(tmp_path, sheet_name=bom_sheet)
    finally:
        # 删除临时文件
        os.unlink(tmp_path)

    # 定义标准列名
    standard_columns = [
        "level", "part_code", "part_name", "spec", 
        "version", "material", "unit_count_per_level", "unit_weight_kg", "total_weight_kg", 
        "part_property", "drawing_size", "reference_number", "purchase_status", "process_route", "remark"
    ]
    
    # 获取实际列数
    num_columns = len(df.columns)
    
    # 跳过第一列，从第二列开始映射
    # 获取实际可用列数（排除第一列后）
    usable_columns = num_columns - 1
    
    if usable_columns <= 0:
        raise ValueError("Excel文件列数不足")
    
    # 创建一个新的DataFrame，跳过第一列
    df_skipped = df.iloc[:, 1:]
    
    # 根据实际列数映射列名
    if usable_columns <= len(standard_columns):
        # 重命名现有列
        rename_dict = {df_skipped.columns[i]: standard_columns[i] for i in range(usable_columns)}
        df_skipped.rename(columns=rename_dict, inplace=True)
        
        # 添加缺失的列
        for i in range(usable_columns, len(standard_columns)):
            df_skipped[standard_columns[i]] = None
    else:
        # 重命名前len(standard_columns)列，忽略多余的列
        rename_dict = {df_skipped.columns[i]: standard_columns[i] for i in range(len(standard_columns))}
        df_skipped.rename(columns=rename_dict, inplace=True)
        
        # 如果有多余的列，忽略它们
        if len(df_skipped.columns) > len(standard_columns):
            df_skipped = df_skipped[standard_columns]
    
    # 使用新的DataFrame替换原来的
    df = df_skipped

    # 确保所有标准列都存在
    for col in standard_columns:
        if col not in df.columns:
            df[col] = None

    # 数据类型转换和清理
    # 处理unit_count_per_level列，保留原始值，但将NaN值填充为空字符串
    df["unit_count_per_level"] = df["unit_count_per_level"].fillna('').astype(str)
    
    # 处理unit_weight_kg列，保留原始值，但将NaN值填充为空字符串
    df["unit_weight_kg"] = df["unit_weight_kg"].fillna('').astype(str)
    df["total_weight_kg"] = pd.to_numeric(df["total_weight_kg"], errors='coerce').fillna(0)
    
    # 添加批次和项目名
    df["upload_batch"] = upload_batch
    df["project_name"] = project_name

    conn = get_connection()
    cur = conn.cursor()

    # 确保列的顺序正确
    columns_in_order = standard_columns + ["upload_batch", "project_name"]
    
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT INTO parts_library (
                    level, part_code, part_name, spec,
                    version, material, unit_count_per_level, unit_weight_kg, total_weight_kg,
                    part_property, drawing_size, reference_number, purchase_status, process_route, remark,
                    upload_batch, project_name
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, tuple(row[col] for col in columns_in_order))
        except Exception as e:
            print(f"插入数据时出错: {e}")
            print(f"错误数据: {tuple(row[col] for col in columns_in_order)}")
            raise e

    conn.commit()
    cur.close()
    conn.close()
    return len(df)