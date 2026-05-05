# NHCX CLI Enhancement Ideas

This document tracks potential improvements, bug fixes, and new features for the NHCX CLI application.

## 📋 General Improvements
- [ ] **Real Form Handling:** Replace controlled state with a form library like `react-hook-form` for better validation and performance.
- [ ] **Error Handling:** Implement a global error boundary and more robust error handling for API calls.
- [ ] **Loading States:** Add more granular loading indicators for individual UI components.
- [ ] **Responsiveness:** Fine-tune the responsive design, especially for tablet and mobile views.

## 👤 Patient Management
- [ ] **Patient Profile:** Create a dedicated view for patient profiles, including historical claims and demographic data.
- [ ] **Add/Edit Patient:** Implement functionality to register new patients or update existing ones.

## 🏥 Workflow Enhancements
- [ ] **Dynamic Procedure Selection:** Allow users to search and add multiple procedures from a library (ICD-10/PCS).
- [ ] **Document Uploads:** Implement a real file upload mechanism for "Admission Note", "Doctor Prescription", etc.
- [ ] **Advanced Preauth Review:** Add more clinical fields (e.g., vital signs, lab results) to the pre-authorization request.
- [ ] **Status Polling:** Optimize status polling with WebSockets or Server-Sent Events (if supported by the backend).

## 🏢 Payer Network
- [ ] **Payer Directory:** Transform the static "Payer Network" view into a searchable directory with detailed payer information.
- [ ] **Scheme Details:** Provide more information about different insurance schemes and their coverage rules.

## 🛠️ Technical Debt
- [ ] **API Mocking:** Transition from the manual `delay` in `api.js` to a proper mocking library like `MSW` (Mock Service Worker).
- [ ] **Component Library:** Further abstract common UI patterns into the `Common.jsx` component library.
- [ ] **Unit/Integration Tests:** Add tests for key components and workflow logic.
