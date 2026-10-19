import Shell, { NAV } from './components/Shell.jsx';
import Login from './components/Login.jsx';
import Icon from './components/Icon.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Eviden from './pages/Eviden.jsx';
import Generator from './pages/Generator.jsx';
import GasTrigger from './pages/GasTrigger.jsx';
import ProblemSolve from './pages/ProblemSolve.jsx';
import TelegramBot from './pages/TelegramBot.jsx';
import Pengaturan from './pages/Pengaturan.jsx';
import { useToken } from './lib/api.js';
import { useIdleLogout } from './lib/prefs.js';
import { Link, useLocation } from './lib/router.js';

function Soon({ path }) {
  const item = NAV.flatMap(g => g.items).find(i => i.to === path);
  return (
    <div className="max-w-xl mx-auto mt-16 text-center space-y-3">
      <div className="mx-auto w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center text-primary-container">
        <Icon name={item ? item.icon : 'construction'} size={28} />
      </div>
      <h1 className="text-headline-lg">{item ? item.label : 'Halaman tidak ditemukan'}</h1>
      <p className="text-body-md text-outline">
        {item ? 'Halaman ini belum dibangun.' : 'Alamat yang dibuka tidak ada.'}
      </p>
      <Link to="/" className="inline-block px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright font-label text-label-lg">Kembali ke Dashboard</Link>
    </div>
  );
}

export default function App() {
  const token = useToken();
  useIdleLogout();
  const { path } = useLocation();
  if (!token) return <Login />;

  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  let page;
  if (clean === '/') page = <Dashboard />;
  else if (clean === '/eviden') page = <Eviden />;
  else if (clean === '/generator') page = <Generator />;
  else if (clean === '/gas-trigger') page = <GasTrigger />;
  else if (clean === '/problem-solve') page = <ProblemSolve />;
  else if (clean === '/telegram') page = <TelegramBot />;
  else if (clean === '/pengaturan') page = <Pengaturan />;
  else page = <Soon path={clean} />;
  return <Shell>{page}</Shell>;
}
