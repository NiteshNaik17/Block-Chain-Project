import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, ShieldCheck, X } from 'lucide-react';
import Logo from './Logo';
import Button from './Button';
import { cn } from '../../utils/format';

/** Landing-page navigation. Home / About / Features / How It Works anchor to
 *  sections of the landing page; Login and Get Started are real routes. */
const NAV_LINKS = [
  { label: 'Home', hash: 'top' },
  { label: 'About', hash: 'about' },
  { label: 'Features', hash: 'features' },
  { label: 'How It Works', hash: 'how-it-works' },
];

export default function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const hrefFor = (hash) => (pathname === '/' ? `#${hash}` : `/#${hash}`);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-white/90 backdrop-blur transition-shadow',
        scrolled ? 'border-slate-200 shadow-card' : 'border-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Logo size="sm" />

        <nav className="ml-8 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a
              key={link.hash}
              href={hrefFor(link.hash)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Button variant="ghost" size="sm" to="/login">
            Login
          </Button>
          <Button variant="accent" size="sm" to="/get-started" icon={ShieldCheck}>
            Get Started
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((previous) => !previous)}
          className="ml-auto rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900 lg:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="animate-fade-in border-t border-slate-200 bg-white lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <a
                key={link.hash}
                href={hrefFor(link.hash)}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-navy-900"
              >
                {link.label}
              </a>
            ))}

            <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-3">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="btn-outline w-full"
              >
                Login
              </Link>
              <Link
                to="/get-started"
                onClick={() => setMobileOpen(false)}
                className="btn-accent w-full"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
