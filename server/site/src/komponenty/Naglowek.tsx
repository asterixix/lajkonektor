export function Naglowek() {
  return (
    <header className="naglowek">
      <a className="naglowek-marka" href="#top">
        <img src="/logo.png" alt="" width="32" height="32" />
        <span>Lajkonektor</span>
      </a>
      <nav aria-label="Główna">
        <a href="#narzedzia">Narzędzia</a>
        <a href="#dla-miasta">Dla miasta</a>
        <a href="#podlaczenie">Podłączenie</a>
      </nav>
    </header>
  );
}
