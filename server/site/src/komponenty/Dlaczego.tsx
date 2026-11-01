import { TRESC } from "../tresc.ts";
import { Pojawia } from "./Pojawia.tsx";

export function Dlaczego() {
  const t = TRESC.dlaczego;
  return (
    <div className="rozwiniecie">
        <Pojawia>
          <table className="porownanie">
            <thead>
              <tr><th scope="col"><span className="sr-only">Temat</span></th><th scope="col">{t.dzis}</th><th scope="col">{t.zLajkonektorem}</th></tr>
            </thead>
            <tbody>
              {t.wiersze.map((w) => (
                <tr key={w.temat}>
                  <th scope="row">{w.temat}</th>
                  <td data-etykieta={t.dzis}>{w.dzis}</td>
                  <td data-etykieta={t.zLajkonektorem}>{w.zl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Pojawia>
        <ul className="dowody">
          {t.dowody.map((d, i) => (
            <Pojawia key={d.liczba} jako="li" className="dowod" opoznienie={i * 0.1}>
              <strong>{d.liczba}</strong>
              <p>{d.tekst}</p>
              <p className="zrodlo">Źródło: <a href={d.zrodlo.url}>{d.zrodlo.tekst}</a></p>
            </Pojawia>
          ))}
        </ul>
    </div>
  );
}
