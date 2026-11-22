import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "../../../lib/toast";

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

export default function DropToAttach({ enabled = true, target = "Other files", documents }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const latest = useRef(null);

  useEffect(() => {
    latest.current = async (files) => {
      for (const file of files) {
        const undo = await documents.attachDropped(file);
        if (undo) toast.success(`${file.name} attached to ${target}`, { duration: 7000, action: { label: "Undo", onClick: undo } });
        else toast.error(`${file.name} could not be attached. Check that it is a PDF or a photo and not too large, then try again.`);
      }
    };
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const enter = (e) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setOver(true);
    };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setOver(false);
      }
    };
    const hover = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) latest.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", hover);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", hover);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);

  if (!enabled || !over) return null;
  return (
    <div className="cv-dropveil" aria-hidden="true">
      <div>
        <Upload size={30} />
        <b>Drop the file to attach it</b>
        <small>It will go to: {target}</small>
      </div>
    </div>
  );
}
