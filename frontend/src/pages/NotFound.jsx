import { ArrowLeft, Compass, LayoutDashboard } from 'lucide-react';
import Button from '../components/common/Button';

/** 404 screen for unknown routes. */
export default function NotFound() {
  return (
    <div className="bg-surface">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:py-28">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-50 text-navy-800">
          <Compass size={24} aria-hidden="true" />
        </span>

        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-teal-700">
          Error 404
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-navy-900 sm:text-3xl">
          This page could not be found
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          The link may be out of date, or the page may only exist in a later phase of the build.
          Head back to the landing page or jump straight into a portal preview.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to="/" variant="primary" icon={ArrowLeft}>
            Back to home
          </Button>
          <Button to="/demo" variant="outline" icon={LayoutDashboard}>
            Portal preview
          </Button>
        </div>
      </div>
    </div>
  );
}
