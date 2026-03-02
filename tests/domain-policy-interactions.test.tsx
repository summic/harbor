import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routeState = vi.hoisted(() => ({
  groupName: 'kn-system',
}));

const queryState = vi.hoisted(() => ({
  domainGroups: [] as any[],
  dnsServers: [] as any[],
  domains: [] as any[],
}));

const queryClientState = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

const apiFns = vi.hoisted(() => ({
  getDomainGroups: vi.fn(async () => queryState.domainGroups),
  getDns: vi.fn(async () => queryState.dnsServers),
  saveDomainGroup: vi.fn(async () => queryState.domainGroups),
  deleteDomainGroup: vi.fn(async () => queryState.domainGroups),
  getDomains: vi.fn(async () => queryState.domains),
  saveDomainRule: vi.fn(async () => queryState.domains),
  deleteDomainRule: vi.fn(async () => queryState.domains),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: ({ to }: { to: string }) => <div>NAV:{to}</div>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ groupName: routeState.groupName }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    if (key === 'domainGroups') return { data: queryState.domainGroups, isLoading: false };
    if (key === 'dns') return { data: queryState.dnsServers, isLoading: false };
    if (key === 'domains') return { data: queryState.domains, isLoading: false };
    return { data: undefined, isLoading: false };
  },
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: (payload: any) => Promise<any>; onSuccess?: (next: any) => void }) => ({
    mutate: (payload: any) => {
      void Promise.resolve(mutationFn(payload)).then((next) => {
        onSuccess?.(next);
      });
    },
    isPending: false,
    isSuccess: false,
  }),
  useQueryClient: () => queryClientState,
}));

vi.mock('../api', () => ({
  mockApi: apiFns,
}));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const findButtonByText = (root: TestRenderer.ReactTestInstance, text: string) =>
  root.findAllByType('button').find((node) => {
    const children = node.props.children;
    if (typeof children === 'string') return children.includes(text);
    if (Array.isArray(children)) return children.some((item) => typeof item === 'string' && item.includes(text));
    return false;
  });

const renderWithAct = async (element: React.ReactElement) => {
  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await flush();
  });
  return renderer as TestRenderer.ReactTestRenderer;
};

describe('Domain policy pages interactions', () => {
  beforeEach(() => {
    routeState.groupName = 'kn-system';
    queryState.domainGroups = [
      { id: 'g1', name: 'kn-system', action: 'PROXY', dnsServer: 'dns_direct', ruleCount: 2 },
    ];
    queryState.dnsServers = [{ id: 'dns1', name: 'dns_direct', type: 'dot', address: '223.6.6.6:853', enabled: true }];
    queryState.domains = [
      { id: 'd1', type: 'domain_suffix', value: 'google.com', group: 'kn-system', action: 'PROXY', enabled: true, note: '', priority: 10 },
    ];
    queryClientState.setQueryData.mockReset();
    queryClientState.invalidateQueries.mockReset();
    apiFns.saveDomainGroup.mockClear();
    apiFns.deleteDomainGroup.mockClear();
    apiFns.saveDomainRule.mockClear();
    apiFns.deleteDomainRule.mockClear();
  });

  it('creates and deletes domain group from modal/confirm flows', async () => {
    const { DomainGroupsPage } = await import('../pages/DomainGroups');
    const renderer = await renderWithAct(<DomainGroupsPage />);
    const root = renderer.root;

    const addButton = findButtonByText(root, 'Add Policy Group');
    expect(addButton).toBeDefined();
    await act(async () => {
      addButton!.props.onClick();
    });
    expect(JSON.stringify((renderer as TestRenderer.ReactTestRenderer).toJSON())).toContain('Add Policy Group');

    const groupNameInput = root.findByProps({ placeholder: 'kn-system' });
    const createButton = findButtonByText(root, 'Create');
    await act(async () => {
      groupNameInput.props.onChange({ target: { value: 'overseas' } });
      await flush();
    });
    await act(async () => {
      createButton!.props.onClick();
      await flush();
    });
    expect(apiFns.saveDomainGroup).toHaveBeenCalled();
    expect(queryClientState.invalidateQueries).toHaveBeenCalled();

    const deleteIconButton = root.findAllByType('button').find((node) =>
      node.props.className?.includes('hover:text-rose-600'),
    );
    expect(deleteIconButton).toBeDefined();
    await act(async () => {
      deleteIconButton!.props.onClick({ stopPropagation: () => {} });
    });
    const deleteConfirm = findButtonByText(root, 'Delete');
    await act(async () => {
      deleteConfirm!.props.onClick();
      await flush();
    });
    expect(apiFns.deleteDomainGroup).toHaveBeenCalledWith('kn-system');
  });

  it('handles empty groups rendering', async () => {
    queryState.domainGroups = [];
    const { DomainGroupsPage } = await import('../pages/DomainGroups');
    const renderer = await renderWithAct(<DomainGroupsPage />);
    expect(JSON.stringify(renderer.toJSON())).toContain('No domain groups.');
  });

  it('redirects when active group is missing', async () => {
    routeState.groupName = '';
    const { DomainsPage } = await import('../pages/Domains');
    const renderer = await renderWithAct(<DomainsPage />);
    const html = JSON.stringify(renderer.toJSON());
    expect(html).toContain('NAV:');
    expect(html).toContain('/policy');
  });

  it('creates and deletes domain rule through modal and confirm dialog', async () => {
    const { DomainsPage } = await import('../pages/Domains');
    const renderer = await renderWithAct(<DomainsPage />);
    const root = renderer.root;

    const addRuleButton = findButtonByText(root, 'Add Rule');
    expect(addRuleButton).toBeDefined();
    await act(async () => {
      addRuleButton!.props.onClick();
    });
    expect(JSON.stringify((renderer as TestRenderer.ReactTestRenderer).toJSON())).toContain('Add Domain');

    const domainInput = root.findByProps({ placeholder: 'google.com' });
    const createButton = findButtonByText(root, 'Create');
    await act(async () => {
      domainInput.props.onChange({ target: { value: 'twitter.com' } });
      await flush();
    });
    await act(async () => {
      createButton!.props.onClick();
      await flush();
    });
    expect(apiFns.saveDomainRule).toHaveBeenCalled();
    expect(apiFns.saveDomainRule.mock.calls[0][0].group).toBe('kn-system');

    const deleteIconButton = root.findAllByType('button').find((node) =>
      node.props.className?.includes('hover:text-rose-600'),
    );
    expect(deleteIconButton).toBeDefined();
    await act(async () => {
      deleteIconButton!.props.onClick();
    });
    const deleteConfirm = findButtonByText(root, 'Delete');
    await act(async () => {
      deleteConfirm!.props.onClick();
      await flush();
    });
    expect(apiFns.deleteDomainRule).toHaveBeenCalledWith('d1');
  });

  it('handles empty rules rendering', async () => {
    queryState.domains = [];
    const { DomainsPage } = await import('../pages/Domains');
    const renderer = await renderWithAct(<DomainsPage />);
    expect(JSON.stringify(renderer.toJSON())).toContain('No domain rules.');
  });
});
