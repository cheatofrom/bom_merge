#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import sys
import os

def check_excel_file(file_path):
    """检查Excel文件的结构和内容"""
    try:
        print(f"正在检查Excel文件: {file_path}")
        
        # 检查文件是否存在
        if not os.path.exists(file_path):
            print(f"错误：文件不存在 {file_path}")
            return
        
        # 读取Excel文件的所有工作表
        excel_file = pd.ExcelFile(file_path)
        print(f"工作表列表: {excel_file.sheet_names}")
        
        # 检查每个工作表
        for sheet_name in excel_file.sheet_names:
            print(f"\n=== 工作表: {sheet_name} ===")
            
            # 读取工作表数据
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            
            print(f"行数: {len(df)}")
            print(f"列数: {len(df.columns)}")
            print(f"列名: {list(df.columns)}")
            
            # 显示前5行数据
            print("\n前5行数据:")
            print(df.head())
            
            # 检查空值情况
            print("\n空值统计:")
            print(df.isnull().sum())
            
            # 检查数据类型
            print("\n数据类型:")
            print(df.dtypes)
            
            print("-" * 50)
            
    except Exception as e:
        print(f"读取Excel文件时出错: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # 检查指定的Excel文件
    excel_file = "/home/dell/mnt/ai-work/bom_merge/02 重卡产品-主减速器系统_2025.09.05.xlsx"
    check_excel_file(excel_file)
    
    # 也检查上传目录中的其他Excel文件
    upload_dir = "/home/dell/mnt/ai-work/bom_merge/hd/uploaded_files"
    if os.path.exists(upload_dir):
        print(f"\n\n=== 检查上传目录中的Excel文件 ===")
        for file in os.listdir(upload_dir):
            if file.endswith(('.xlsx', '.xls')):
                file_path = os.path.join(upload_dir, file)
                print(f"\n检查文件: {file}")
                check_excel_file(file_path)