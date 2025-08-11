# 通过文件ID合并零部件功能说明

## 功能概述

本次更新添加了通过文件唯一ID（file_unique_id）而不是项目名称（project_name）来合并零部件的功能。这样可以确保即使项目名称发生变化，也能准确地引用到正确的源文件。

## 实现细节

### 后端更改

1. 新增了 `/merge_parts_by_file_ids` API，接受 `file_unique_ids` 列表作为请求参数
2. 修改了 `SaveMergedProjectRequest` 模型，添加了可选的 `source_file_ids` 字段
3. 更新了 `save_merged_project` 函数，支持保存源文件ID
4. 添加了 `source_file_ids` 字段到 `merged_projects` 表

### 前端更改

1. 新增了 `mergePartsByFileIds` API 函数，用于通过文件ID合并零部件
2. 修改了 `ProjectSelection.tsx` 中的 `handleProjectToggle` 和 `handleMergeClick` 函数，支持选择和传递文件ID
3. 修改了 `MergedParts.tsx` 中的合并逻辑，优先使用文件ID进行合并
4. 更新了 `saveMergedProject` API 函数和调用，支持保存源文件ID

## 数据库迁移

执行以下步骤添加 `source_file_ids` 字段到 `merged_projects` 表：

```bash
./add_source_file_ids_column.sh
```

## 使用方法

用户操作流程没有变化，系统会自动在后台使用文件ID进行合并。如果通过文件ID合并失败，系统会自动回退到使用项目名称进行合并，确保兼容性。

## 注意事项

1. 此功能需要数据库中的 `merged_projects` 表有 `source_file_ids` 字段
2. 旧的合并项目记录没有 `source_file_ids` 信息，只能通过项目名称查看
3. 新保存的合并项目会同时保存项目名称和文件ID，提高了引用的稳定性