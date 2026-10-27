import { navItems } from './lib/nav';

export function App() {
  return (
    <main>
      <h1>Orbit</h1>
      <ul>
        {navItems.map((item) => (
          <li key={item.path}>{item.label}</li>
        ))}
      </ul>
    </main>
  );
}
