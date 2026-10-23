import { createContext, useContext } from "react";

// A global admin's session sees every facility and changes nothing. App.jsx
// provides the flag from /session; write buttons read it to disable themselves.
export const ReadOnlyContext = createContext(false);

export const useReadOnly = () => useContext(ReadOnlyContext);

export const READ_ONLY_TITLE = "This account can view only";
