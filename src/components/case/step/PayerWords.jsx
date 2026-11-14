import PayrErrorList from "../../ui/PayrErrorList";

const textOf = (note) => (typeof note === "string" ? note : note?.text || note?.display || "");

export default function PayerWords({ notes = [], errors = [], empty = "The payer gave no reason." }) {
  const texts = (notes || []).map(textOf).filter(Boolean);
  if (!texts.length && !errors?.length) return <p className="cv-card-meta cv-payer-empty">{empty}</p>;
  return (
    <div className="cv-payer-words">
      {texts.map((text, i) => (
        <blockquote key={i} className="cv-quote">
          {text}
        </blockquote>
      ))}
      <PayrErrorList errors={errors} />
    </div>
  );
}
