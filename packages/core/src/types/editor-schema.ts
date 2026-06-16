// Schema déclaratif pour la génération de formulaires d'édition

export type FieldType = 'number' | 'text' | 'textarea' | 'code' | 'boolean' | 'select';

export interface NumberField {
  type: 'number';
  key: string;
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface TextField {
  type: 'text';
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  pattern?: string;
  multiline?: boolean;
  rows?: number;
}

export interface TextareaField {
  type: 'textarea';
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  rows?: number;
  spellcheck?: boolean;
}

export interface CodeField {
  type: 'code';
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  rows?: number;
  language?: string;
}

export interface BooleanField {
  type: 'boolean';
  key: string;
  label: string;
  defaultValue: boolean;
}

export interface SelectField {
  type: 'select';
  key: string;
  label: string;
  defaultValue: string | number;
  options: Array<{ value: string | number; label: string }>;
}

export type EditorField = NumberField | TextField | TextareaField | CodeField | BooleanField | SelectField;

export interface EditorSchema {
  fields: EditorField[];
}
