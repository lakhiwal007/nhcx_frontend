import { PatientCard, StatusBadge } from "nhcx_cli";

const SAMPLE_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#5b8def"/><circle cx="40" cy="32" r="16" fill="#fff"/><path d="M12 76c4-20 20-28 28-28s24 8 28 28" fill="#fff"/></svg>',
  );

export const Default = () => (
  <PatientCard
    patient={{ child_id: 10234, name: "Aarav Mehta", gender: "male", mobile: "9876543210" }}
    age={7}
    onClick={() => {}}
  />
);

export const Selected = () => (
  <PatientCard
    patient={{ child_id: 10234, name: "Aarav Mehta", gender: "male", mobile: "9876543210" }}
    age={7}
    isSelected
    onClick={() => {}}
  />
);

export const WithActiveCase = () => (
  <PatientCard
    patient={{
      child_id: 10391,
      name: "Diya Kulkarni",
      gender: "female",
      mobile: "9123456780",
      cashless_cases_count: 2,
    }}
    age={4}
    onClick={() => {}}
    statusSlot={
      <>
        <StatusBadge status="pending" />
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>NHIS001</span>
      </>
    }
  />
);

export const WithPhoto = () => (
  <PatientCard
    patient={{
      child_id: 10555,
      name: "Rohan Iyer",
      gender: "male",
      mobile: "9988776655",
      profile_photo: SAMPLE_PHOTO,
    }}
    age={9}
    onClick={() => {}}
  />
);
