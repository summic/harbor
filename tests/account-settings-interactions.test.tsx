import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({
  session: {
    accessToken: 'token',
    user: {
      sub: 'u1',
      name: 'Alice',
      preferred_username: 'alice',
      email: 'alice@example.com',
    },
  } as any,
  updateDisplayName: vi.fn(),
}));

const apiFns = vi.hoisted(() => ({
  updateCurrentUserDisplayName: vi.fn(async (displayName: string) => ({ displayName })),
  getMyUnifiedProfile: vi.fn(async () => ({
    content: JSON.stringify({
      route: {
        rule_set: [
          {
            tag: 'user-domains',
            type: 'inline',
            rules: [{ domain_suffix: ['foo.com'] }],
          },
        ],
        rules: [{ rule_set: ['user-domains'], outbound: 'proxy' }],
      },
      dns: {
        servers: [
          {
            type: 'hosts',
            tag: 'dns_user_hosts',
            predefined: {
              'foo.com': '192.168.1.123',
            },
          },
        ],
        rules: [{ domain: ['foo.com'], server: 'dns_user_hosts' }],
      },
    }),
  })),
  getEffectiveUnifiedProfile: vi.fn(async () => ({ content: '{"route":{"final":"direct"}}' })),
  getMyProfileAudits: vi.fn(async () => [
    { id: 1, timestamp: '2026-02-23', summary: 'saved', contentSize: 2048 },
  ]),
  saveMyUnifiedProfile: vi.fn(async () => ({})),
}));

vi.mock('../auth-context', () => ({
  useAuth: () => authState,
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
    const child = node.props.children;
    if (typeof child === 'string') return child.includes(text);
    if (Array.isArray(child)) return child.some((item) => typeof item === 'string' && item.includes(text));
    return false;
  });

const findButtonWithExactText = (root: TestRenderer.ReactTestInstance, text: string) =>
  root.findAllByType('button').find((node) => {
    const child = node.props.children;
    if (typeof child === 'string') return child.trim() === text;
    if (Array.isArray(child)) {
      const textNodes = child.filter((item) => typeof item === 'string') as string[];
      return textNodes.join('').trim() === text;
    }
    return false;
  });

describe('AccountSettings page interactions', () => {
  beforeEach(() => {
    authState.session = {
      accessToken: 'token',
      user: {
        sub: 'u1',
        name: 'Alice',
        preferred_username: 'alice',
        email: 'alice@example.com',
      },
    };
    authState.updateDisplayName.mockReset();

    apiFns.updateCurrentUserDisplayName.mockClear();
    apiFns.getMyUnifiedProfile.mockClear();
    apiFns.getEffectiveUnifiedProfile.mockClear();
    apiFns.getMyProfileAudits.mockClear();
    apiFns.saveMyUnifiedProfile.mockClear();
  });

  it('loads profile on mount and hydrates visual editors', async () => {
    const { AccountSettingsPage } = await import('../pages/AccountSettings');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AccountSettingsPage />);
      await flush();
    });

    const root = (renderer as TestRenderer.ReactTestRenderer).root;
    expect(apiFns.getMyUnifiedProfile).toHaveBeenCalledTimes(1);
    expect(apiFns.getEffectiveUnifiedProfile).toHaveBeenCalledTimes(1);
    expect(apiFns.getMyProfileAudits).toHaveBeenCalledWith(20);

    const suffixEditor = root.findByProps({ placeholder: 'example.com' });
    expect(suffixEditor.props.value).toContain('foo.com');
    const hostsEditor = root.findByProps({ placeholder: '192.168.1.123 chat-staging.beforeve.com' });
    expect(hostsEditor.props.value).toContain('192.168.1.123 foo.com');
    expect(JSON.stringify((renderer as TestRenderer.ReactTestRenderer).toJSON())).toContain('saved');
  });

  it('applies visual editor values into JSON and saves personal config', async () => {
    const { AccountSettingsPage } = await import('../pages/AccountSettings');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AccountSettingsPage />);
      await flush();
    });
    const root = (renderer as TestRenderer.ReactTestRenderer).root;

    const suffixEditor = root.findByProps({ placeholder: 'example.com' });
    const hostsEditor = root.findByProps({ placeholder: '192.168.1.123 chat-staging.beforeve.com' });
    const outboundSelect = root.findByType('select');
    const applyButton = findButtonByText(root, 'Apply to JSON');
    const savePersonalButton = findButtonByText(root, 'Save Personal Config');
    expect(applyButton).toBeDefined();
    expect(savePersonalButton).toBeDefined();

    await act(async () => {
      suffixEditor.props.onChange({ target: { value: 'google.com\ntwitter.com' } });
      hostsEditor.props.onChange({ target: { value: '127.0.0.1 local.test' } });
      outboundSelect.props.onChange({ target: { value: 'block' } });
    });

    await act(async () => {
      applyButton!.props.onClick();
    });

    await act(async () => {
      await savePersonalButton!.props.onClick();
      await flush();
    });

    expect(apiFns.saveMyUnifiedProfile).toHaveBeenCalledTimes(1);
    const payload = apiFns.saveMyUnifiedProfile.mock.calls[0][0];
    const parsed = JSON.parse(payload.content);
    expect(parsed.route.rule_set.some((item: any) => item.tag === 'user-domains')).toBe(true);
    expect(parsed.route.rules.some((item: any) => item.outbound === 'block')).toBe(true);
    expect(parsed.dns.servers.some((item: any) => item.tag === 'dns_user_hosts')).toBe(true);
    expect(JSON.stringify((renderer as TestRenderer.ReactTestRenderer).toJSON())).toContain('Personal profile saved.');
  });

  it('shows save profile parse error on invalid JSON', async () => {
    const { AccountSettingsPage } = await import('../pages/AccountSettings');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AccountSettingsPage />);
      await flush();
    });
    const root = (renderer as TestRenderer.ReactTestRenderer).root;

    const jsonEditor = root.findAllByType('textarea').find((node) => node.props.className?.includes('h-80'));
    const savePersonalButton = findButtonByText(root, 'Save Personal Config');
    expect(jsonEditor).toBeDefined();
    expect(savePersonalButton).toBeDefined();

    await act(async () => {
      jsonEditor!.props.onChange({ target: { value: '{invalid_json}' } });
    });

    await act(async () => {
      await savePersonalButton!.props.onClick();
    });

    expect(JSON.stringify((renderer as TestRenderer.ReactTestRenderer).toJSON())).toContain('Expected property name');
  });

  it('updates display name and handles save error branch', async () => {
    const { AccountSettingsPage } = await import('../pages/AccountSettings');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AccountSettingsPage />);
      await flush();
    });
    const root = (renderer as TestRenderer.ReactTestRenderer).root;

    const saveButton = findButtonWithExactText(root, 'Save');
    expect(saveButton).toBeDefined();

    await act(async () => {
      await saveButton!.props.onClick();
      await flush();
    });
    expect(apiFns.updateCurrentUserDisplayName).toHaveBeenCalledWith('Alice');
    expect(authState.updateDisplayName).toHaveBeenCalledWith('Alice');
    expect(JSON.stringify((renderer as TestRenderer.ReactTestRenderer).toJSON())).toContain('Name updated.');

    apiFns.updateCurrentUserDisplayName.mockRejectedValueOnce(new Error('update failed'));
    await act(async () => {
      await saveButton!.props.onClick();
      await flush();
    });
    expect(JSON.stringify((renderer as TestRenderer.ReactTestRenderer).toJSON())).toContain('update failed');
  });
});
