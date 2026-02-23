import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState, LoadingOverlay, SectionCard, StatusBadge } from '../components/Common';

describe('Common components', () => {
  it('renders section card with title, description and actions', () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Card Title" description="Card Description" actions={<button>Action</button>}>
        <div>Body Content</div>
      </SectionCard>,
    );

    expect(html).toContain('Card Title');
    expect(html).toContain('Card Description');
    expect(html).toContain('Body Content');
    expect(html).toContain('Action');
  });

  it('renders empty state and default icon container', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No Data" description="Please add data" />,
    );
    expect(html).toContain('No Data');
    expect(html).toContain('Please add data');
  });

  it('renders status badge variants', () => {
    const activeHtml = renderToStaticMarkup(<StatusBadge active />);
    const inactiveHtml = renderToStaticMarkup(<StatusBadge active={false} />);

    expect(activeHtml).toContain('Enabled');
    expect(inactiveHtml).toContain('Disabled');
  });

  it('renders loading overlay markup', () => {
    const html = renderToStaticMarkup(<LoadingOverlay />);
    expect(html).toContain('animate-spin');
  });
});
