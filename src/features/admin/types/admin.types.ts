export type AdminResourceKey =
  | "brands"
  | "bikeModels"
  | "bikeModelYears"
  | "tireProducts"
  | "batteryProducts"
  | "tireFitments";

export type AdminRow = Record<string, string | number | boolean | null>;

export type AdminField = {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "textarea";
  required?: boolean;
  readonly?: boolean;
};

export type AdminResourceConfig = {
  key: AdminResourceKey;
  label: string;
  table: string;
  primaryKey: string;
  searchColumns: string[];
  fields: AdminField[];
};
