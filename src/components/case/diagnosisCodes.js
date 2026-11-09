export const ICD_10 = "http://hl7.org/fhir/sid/icd-10";

export const CODE_SYSTEMS = [
  { value: ICD_10, label: "ICD-10" },
  { value: "http://snomed.info/sct", label: "SNOMED CT" },
];

export const effectiveSystem = (diag) => diag.code_system || (diag.code ? ICD_10 : "");
