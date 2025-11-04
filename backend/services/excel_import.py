import pandas as pd
from db import  get_async_db_connection
import tempfile
import os
import traceback
import logging
from services.mapping_service import  create_file_mapping_async

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("excel_import.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("excel_import")

async def import_excel_to_db_async(file_stream, upload_batch, project_name, file_unique_id=None):
    """
    异步版本的Excel导入函数
    
    Args:
        file_stream: 文件流
        upload_batch (str): 上传批次
        project_name (str): 项目名称
        file_unique_id (str, optional): 文件唯一ID
    
    Returns:
        int: 导入的行数
    """
    logger.info(f"开始异步导入Excel文件，项目名称: {project_name}, 批次: {upload_batch}, 文件ID: {file_unique_id}")
    
    # 文件处理部分与同步版本相同
    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
        file_stream.seek(0)
        file_content = file_stream.read()
        logger.info(f"文件大小: {len(file_content)} 字节")
        tmp.write(file_content)
        tmp_path = tmp.name
        logger.info(f"临时文件创建成功: {tmp_path}")

    try:
        # Excel读取和数据处理逻辑与同步版本相同
        logger.info("开始读取Excel文件")
        # 指定引擎以支持不同格式的Excel文件
        try:
            xls = pd.ExcelFile(tmp_path, engine='openpyxl')
        except Exception as e:
            logger.warning(f"使用openpyxl引擎失败: {e}，尝试使用xlrd引擎")
            try:
                xls = pd.ExcelFile(tmp_path, engine='xlrd')
            except Exception as e2:
                logger.error(f"使用xlrd引擎也失败: {e2}，尝试自动检测")
                xls = pd.ExcelFile(tmp_path)
        
        logger.info(f"Excel工作表列表: {xls.sheet_names}")
        
        # 统一使用第一张工作表
        if len(xls.sheet_names) > 0:
            bom_sheet = xls.sheet_names[0]  # 第一个表（索引从0开始）
            logger.info(f"使用第一个工作表: {bom_sheet}")
        else:
            error_msg = "Excel文件中没有工作表"
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # 读取指定的工作表
        logger.info(f"读取工作表: {bom_sheet}")
        df = pd.read_excel(tmp_path, sheet_name=bom_sheet)
        logger.info(f"成功读取工作表，行数: {len(df)}, 列数: {len(df.columns)}")
        logger.debug(f"列名: {df.columns.tolist()}")
        
        # 定义标准列名
        standard_columns = [
            "level", "part_code", "part_name", "spec", 
            "version", "material", "unit_count_per_level", "unit_weight_kg", "total_weight_kg", 
            "part_property", "drawing_size", "reference_number", "purchase_status", "process_route", "remark",
            "serial_number", "erp_inventory_number", "status_type", "parent_part", "factory", "pbom_description"
        ]
        
        # 获取实际列数
        num_columns = len(df.columns)
        
        # 不跳过第一列，从第一列开始映射
        # 获取实际可用列数
        usable_columns = num_columns
        
        if usable_columns <= 0:
            raise ValueError("Excel文件列数不足")
        
        # 使用完整的DataFrame，不跳过任何列
        df_skipped = df.copy()
        
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
        logger.info("开始数据类型转换和清理")
        
        # 处理level列，确保它是字符串类型
        logger.info("处理level列")
        try:
            df["level"] = pd.to_numeric(df["level"], errors='coerce')
            logger.debug(f"level列转换为数值后的前5个值: {df['level'].head().tolist()}")
            df["level"] = df["level"].fillna(0).astype(int).astype(str)
            logger.debug(f"level列填充空值并转换为字符串后的前5个值: {df['level'].head().tolist()}")
        except Exception as e:
            logger.error(f"处理level列时出错: {e}\n{traceback.format_exc()}")
            raise ValueError(f"处理level列时出错: {e}")
        
        # 处理unit_count_per_level列，保留原始值，但将NaN值填充为空字符串
        logger.info("处理unit_count_per_level列")
        try:
            df["unit_count_per_level"] = df["unit_count_per_level"].fillna('').astype(str)
            logger.debug(f"unit_count_per_level列处理后的前5个值: {df['unit_count_per_level'].head().tolist()}")
        except Exception as e:
            logger.error(f"处理unit_count_per_level列时出错: {e}\n{traceback.format_exc()}")
            raise ValueError(f"处理unit_count_per_level列时出错: {e}")
        
        # 处理unit_weight_kg列，避免浮点数精度问题
        logger.info("处理unit_weight_kg列")
        try:
            # 避免浮点数精度问题的正确处理方式
            def format_numeric_value(value):
                if pd.isna(value):
                    return ''
                if isinstance(value, (int, float)):
                    # 使用Decimal来保持精度，然后格式化为合理的小数位数
                    from decimal import Decimal, ROUND_HALF_UP
                    try:
                        # 转换为Decimal并保留6位小数精度，去除尾随零
                        decimal_val = Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
                        # 去除尾随零并返回字符串
                        return str(decimal_val.normalize())
                    except:
                        return str(value)
                return str(value)

            df["unit_weight_kg"] = df["unit_weight_kg"].apply(format_numeric_value)
            logger.debug(f"unit_weight_kg列处理后的前5个值: {df['unit_weight_kg'].head().tolist()}")
        except Exception as e:
            logger.error(f"处理unit_weight_kg列时出错: {e}\n{traceback.format_exc()}")
            raise ValueError(f"处理unit_weight_kg列时出错: {e}")

        logger.info("处理total_weight_kg列")
        try:
            # 避免浮点数精度问题的正确处理方式
            def format_numeric_value(value):
                if pd.isna(value):
                    return ''
                if isinstance(value, (int, float)):
                    # 使用Decimal来保持精度，然后格式化为合理的小数位数
                    from decimal import Decimal, ROUND_HALF_UP
                    try:
                        # 转换为Decimal并保留6位小数精度，去除尾随零
                        decimal_val = Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
                        # 去除尾随零并返回字符串
                        return str(decimal_val.normalize())
                    except:
                        return str(value)
                return str(value)

            df["total_weight_kg"] = df["total_weight_kg"].apply(format_numeric_value)
            logger.debug(f"total_weight_kg列处理后的前5个值: {df['total_weight_kg'].head().tolist()}")
        except Exception as e:
            logger.error(f"处理total_weight_kg列时出错: {e}\n{traceback.format_exc()}")
            raise ValueError(f"处理total_weight_kg列时出错: {e}")
        
        # 处理所有字符串字段，确保它们都是字符串类型
        string_columns = ['part_code', 'part_name', 'spec', 'version', 'material', 
                         'part_property', 'drawing_size', 'reference_number', 
                         'purchase_status', 'process_route', 'remark',
                         'serial_number', 'erp_inventory_number', 'status_type', 
                         'parent_part', 'factory', 'pbom_description']
        
        for col in string_columns:
            if col in df.columns:
                logger.info(f"处理{col}列")
                try:
                    df[col] = df[col].fillna('').astype(str)
                    logger.debug(f"{col}列处理后的前5个值: {df[col].head().tolist()}")
                except Exception as e:
                    logger.error(f"处理{col}列时出错: {e}\n{traceback.format_exc()}")
                    raise ValueError(f"处理{col}列时出错: {e}")
        
        # 添加批次、项目名和文件唯一ID
        df["upload_batch"] = upload_batch
        df["project_name"] = project_name
        df["file_unique_id"] = file_unique_id

        # 异步数据库插入
        async with get_async_db_connection() as conn:
            columns_in_order = standard_columns + ["upload_batch", "project_name", "file_unique_id"]
            
            logger.info(f"开始异步插入数据到数据库，共 {len(df)} 行")
            inserted_count = 0
            
            for index, row in df.iterrows():
                try:
                    # 转换数值类型字段的空字符串为None，特殊字符为字符串
                    processed_values = []
                    for col in columns_in_order:
                        value = row[col]
                        # 对于数值类型字段，将空字符串转换为None，其他所有值转为字符串
                        if col in ['unit_weight_kg', 'total_weight_kg']:
                            if value == '':
                                processed_values.append(None)
                            else:
                                # 强制转换为字符串，确保即使是特殊字符如'/'也能正确处理
                                processed_values.append(str(value))
                        else:
                            processed_values.append(value)

                    values = tuple(processed_values)
                    await conn.execute("""
                        INSERT INTO parts_library (
                            level, part_code, part_name, spec,
                            version, material, unit_count_per_level, unit_weight_kg, total_weight_kg,
                            part_property, drawing_size, reference_number, purchase_status, process_route, remark,
                            serial_number, erp_inventory_number, status_type, parent_part, factory, pbom_description,
                            upload_batch, project_name, file_unique_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
                    """, *values)
                    inserted_count += 1
                    if inserted_count % 100 == 0:
                        logger.info(f"已插入 {inserted_count} 行数据")
                except Exception as e:
                    error_msg = f"插入第 {index+1} 行数据时出错: {e}"
                    logger.error(error_msg)
                    logger.error(f"错误数据: {tuple(row[col] for col in columns_in_order)}")
                    raise ValueError(error_msg)
        
        logger.info(f"数据库插入完成，共插入 {inserted_count} 行数据")
        
        # 异步创建文件映射
        if file_unique_id:
            logger.info(f"开始创建文件与项目的映射关系，文件ID: {file_unique_id}, 项目名称: {project_name}")
            try:
                await create_file_mapping_async(
                    file_unique_id=file_unique_id,
                    entity_type='project',
                    entity_id=project_name,
                    mapping_type='excel_import',
                    mapping_data={
                        'upload_batch': upload_batch,
                        'rows_count': len(df),
                        'sheet_name': bom_sheet
                    }
                )
                logger.info("文件与项目的映射关系创建成功")
                
                # 为每个零件创建映射
                for _, row in df.iterrows():
                    if row['part_code'] and str(row['part_code']).strip():
                        await create_file_mapping_async(
                            file_unique_id=file_unique_id,
                            entity_type='part',
                            entity_id=str(row['part_code']),
                            mapping_type='part_in_excel',
                            mapping_data={
                                'part_name': row['part_name'],
                                'level': int(row['level']),
                                'project_name': project_name
                            }
                        )
            except Exception as e:
                error_msg = f"创建文件映射时出错: {e}"
                logger.error(error_msg)
                logger.error(f"详细错误信息: {traceback.format_exc()}")
        
        logger.info(f"异步Excel导入完成，共处理 {len(df)} 行数据")
        return len(df)
        
    finally:
        # 清理临时文件
        try:
            os.unlink(tmp_path)
            logger.info(f"临时文件已删除: {tmp_path}")
        except Exception as e:
            logger.warning(f"删除临时文件时出错: {e}")