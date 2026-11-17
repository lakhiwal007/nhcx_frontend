import BackButton from "../../ui/BackButton";

export default function StageBar({ ctx }) {
  const bar = ctx?.stageBar;
  if (!bar) return null;
  return (
    <>
      {bar.back && <BackButton onClick={bar.back.onClick}>{bar.back.label}</BackButton>}
      <h1 className="cv-stage-title">{bar.title}</h1>
      {bar.tools.length > 0 && (
        <span className="cv-stage-tools">
          {bar.tools.map((tool) => (
            <button key={tool.label} type="button" className="cv-link" onClick={tool.onClick}>
              {tool.label}
            </button>
          ))}
        </span>
      )}
    </>
  );
}
