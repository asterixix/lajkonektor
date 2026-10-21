import { TRESC } from "../tresc.ts";

const [b1, b2, b3, b4, b5, b6] = TRESC.dlaMiasta.bloki;

export function DlaMiasta() {
  return (
    <section id="dla-miasta" aria-labelledby="dla-miasta-tytul" className="dla-miasta">
      <h2 id="dla-miasta-tytul">{TRESC.dlaMiasta.naglowek}</h2>
      <article className="dm-duzy">
        <p className="dm-etykieta">{b1.etykieta}</p>
        <h3>{b1.naglowek}</h3>
        <p className="dm-liczby"><span>5%</span> bez MCP (ChatGPT), <span>95%</span> z MCP</p>
        <p>{b1.tekst}</p>
      </article>
      <div className="dm-para">
        <article className="dm-wezszy">
          <p className="dm-etykieta">{b2.etykieta}</p>
          <h3>{b2.naglowek}</h3>
          <p>{b2.tekst}</p>
        </article>
        <article className="dm-szerszy">
          <p className="dm-etykieta">{b3.etykieta}</p>
          <h3>{b3.naglowek}</h3>
          <p>{b3.tekst}</p>
        </article>
      </div>
      <article className="dm-lista">
        <p className="dm-etykieta">{b4.etykieta}</p>
        <h3>{b4.naglowek}</h3>
        <p>{b4.tekst}</p>
      </article>
      <blockquote className="dm-fakt">
        <p className="dm-etykieta">{b5.etykieta}</p>
        <p>{b5.tekst}</p>
      </blockquote>
      <article className="dm-zamkniecie">
        <p className="dm-etykieta">{b6.etykieta}</p>
        <h3>{b6.naglowek}</h3>
        <p>{b6.tekst}</p>
      </article>
    </section>
  );
}
