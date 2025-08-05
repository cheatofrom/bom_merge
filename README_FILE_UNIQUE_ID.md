# 文件唯一ID功能实现说明

## 功能概述

为了解决上传文件可能重名的问题，我们为每个上传的Excel文件添加了唯一ID（UUID）。这个唯一ID将在文件上传时生成，并存储在数据库中，与该文件导入的所有零部件记录关联。

## 实现变更

### 数据库变更

1. 在`parts_library`表中添加了`file_unique_id`字段，用于存储文件的唯一ID

### 后端变更

1. 修改了`main.py`中的`upload_parts_excel`函数，为每个上传的文件生成唯一ID
2. 修改了`excel_import.py`中的`import_excel_to_db`函数，接受并存储文件唯一ID
3. 更新了数据库插入语句，包含`file_unique_id`字段

### 前端变更

1. 更新了类型定义，在`Part`和`Project`接口中添加了`file_unique_id`字段
2. 更新了API调用，确保上传文件成功后显示文件唯一ID
3. 修改了上传成功提示，显示文件唯一ID的前8位字符

## 如何应用这些更改

### 1. 数据库迁移

执行以下SQL脚本，为现有的`parts_library`表添加`file_unique_id`字段：

```bash
psql -U your_username -d your_database -f migration_add_file_unique_id.sql
```

### 2. 代码更新

1. 更新所有修改的文件：
   - `/home/dell/mnt/ai-work/bom_merge/hd/main.py`
   - `/home/dell/mnt/ai-work/bom_merge/hd/services/excel_import.py`
   - `/home/dell/mnt/ai-work/bom_merge/fronted/src/types/index.ts`
   - `/home/dell/mnt/ai-work/bom_merge/fronted/src/services/api.ts`
   - `/home/dell/mnt/ai-work/bom_merge/fronted/src/pages/ProjectSelection.tsx`

2. 重启后端服务：

```bash
cd /home/dell/mnt/ai-work/bom_merge/hd
python main.py
```

3. 重新构建前端：

```bash
cd /home/dell/mnt/ai-work/bom_merge/fronted
npm run build
```

## 测试

1. 上传多个Excel文件，确认每个文件都有唯一ID
2. 检查上传成功提示中是否显示文件唯一ID
3. 查询数据库，确认`parts_library`表中的记录包含正确的`file_unique_id`值