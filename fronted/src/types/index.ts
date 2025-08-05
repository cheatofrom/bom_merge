// 零部件类型定义
export interface Part {
  id: number;
  level: number;
  part_code: string;
  part_name: string;
  spec: string;
  version: string;
  material: string;
  unit_count_per_level: string;
  unit_weight_kg: string;
  total_weight_kg: number;
  part_property: string;
  drawing_size: string;
  reference_number: string;
  purchase_status: string;
  process_route: string;
  remark: string;
  upload_batch: string;
  project_name: string;
  file_unique_id: string;
  created_at: string;
}

// 项目类型定义
export interface Project {
  project_name: string;
  upload_batch: string;
  file_unique_id: string;
}

// 项目备注类型定义
export interface ProjectNote {
  id?: number;
  project_name: string;
  file_unique_id?: string;
  note: string;
  created_at?: string;
  updated_at?: string;
}