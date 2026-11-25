import BackButton from "../../ui/BackButton";

export default function StageBar({ ctx }) {
  const bar = ctx?.stageBar;
  if (!bar) return null;
  return (
    <>
      {bar.back && <BackButton onClick={bar.back.onClick}>{bar.back.label}</BackButton>}
      <h1 className="cv-stage-title">{bar.title}</h1>
    </>
  );
}
