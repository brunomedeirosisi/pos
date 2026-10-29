// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchableSelect, type SelectOption } from './SearchableSelect';
import i18n from '../../lib/i18n';

const options = [
  { value: 'maria-id', label: 'Maria Silva' },
  { value: 'joao-id', label: 'João Souza' },
  { value: 'mariana-id', label: 'Mariana Costa' },
];
const changed = vi.fn();
let container: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  changed.mockReset();
});
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}
async function render(props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) {
  function Harness() {
    const [value, setValue] = useState('');
    return (
      <>
        <label id="test-select-label" htmlFor="test-select">
          Customer
        </label>
        <SearchableSelect
          id="test-select"
          options={options}
          value={value}
          onChange={(option) => {
            changed(option);
            setValue(option.value);
          }}
          {...props}
        />
      </>
    );
  }
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
  );
  await flush();
}
function input() {
  return container.querySelector<HTMLInputElement>('[role="combobox"]')!;
}
function labels() {
  return Array.from(container.querySelectorAll('[role="option"]')).map((option) => option.textContent);
}
async function type(text: string) {
  await act(async () => {
    input().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(key: string, isComposing = false) {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, isComposing, bubbles: true }));
  });
}
async function choose(label: string) {
  const option = Array.from(container.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (element) => element.textContent === label
  )!;
  await act(async () => option.click());
  await flush();
}

describe.each(['pt-BR', 'en'])('searchable selects in %s', (locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });
  it('filters substrings regardless of case and selects an ID with keyboard navigation', async () => {
    await render();
    await type('MAR');
    expect(labels()).toEqual(['Maria Silva', 'Mariana Costa']);
    expect(changed).not.toHaveBeenCalled();
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(input().getAttribute('aria-controls')!)?.getAttribute('role')).toBe('listbox');
    await key('ArrowDown');
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)?.textContent).toBe('Mariana Costa');
    await key('ArrowUp');
    await key('Enter');
    expect(changed).toHaveBeenLastCalledWith(options[0]);
    expect(input().value).toBe('Maria Silva');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps a selection when unmatched text is abandoned with Escape or blur', async () => {
    await render();
    await type('Maria S');
    await choose('Maria Silva');
    changed.mockClear();
    await type('Unknown');
    await key('Enter');
    expect(container.textContent).toContain(i18n.t('common.searchSelectNoMatches'));
    expect(changed).not.toHaveBeenCalled();
    await key('Escape');
    expect(input().value).toBe('Maria Silva');
    await type('Another draft');
    await act(async () => input().blur());
    expect(input().value).toBe('Maria Silva');
    expect(changed).not.toHaveBeenCalled();
  });
  it('supports mouse selection, an explicit clear button and the empty option', async () => {
    await render();
    await act(async () => input().focus());
    await choose('João Souza');
    const clear = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${i18n.t('common.clearSelection')}"]`
    )!;
    await act(async () => clear.click());
    expect(changed).toHaveBeenLastCalledWith({ value: '', label: i18n.t('common.none') });
    expect(input().value).toBe('');
    await type('Maria S');
    await choose('Maria Silva');
    await key('ArrowDown');
    await choose(i18n.t('common.none'));
    expect(input().value).toBe('');
  });
  it('debounces remote searches and retains names returned outside the initial page', async () => {
    const remote = { value: 'remote-id', label: 'Customer beyond initial page' };
    const loadOptions = vi.fn().mockResolvedValue([remote]);
    await render({ loadOptions });
    await type('9876');
    await flush(200);
    expect(loadOptions).not.toHaveBeenCalled();
    expect(container.textContent).toContain(i18n.t('common.loading'));
    await flush(110);
    expect(loadOptions).toHaveBeenCalledExactlyOnceWith('9876');
    expect(labels()).toEqual([remote.label]);
    await choose(remote.label);
    expect(changed).toHaveBeenLastCalledWith(remote);
    expect(input().value).toBe(remote.label);
    await act(async () => input().focus());
    await key('Escape');
    expect(input().value).toBe(remote.label);
  });
  it('does not offer old remote results while a newer query is pending', async () => {
    let resolveFirst!: (options: SelectOption[]) => void, resolveSecond!: (options: SelectOption[]) => void;
    const first = new Promise<SelectOption[]>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<SelectOption[]>((resolve) => {
      resolveSecond = resolve;
    });
    const loadOptions = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    await render({ loadOptions });
    await type('old');
    await flush(310);
    await type('new');
    await flush(310);
    await act(async () => resolveFirst([{ value: 'old-id', label: 'Old result' }]));
    await flush();
    expect(labels()).toEqual([]);
    await key('Enter');
    expect(changed).not.toHaveBeenCalled();
    await act(async () => resolveSecond([{ value: 'new-id', label: 'New result' }]));
    await flush();
    expect(labels()).toEqual(['New result']);
  });
  it('translates remote failure and allows retry without applying a draft filter', async () => {
    const loadOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error('private technical error'))
      .mockResolvedValueOnce([options[0]]);
    await render({ loadOptions });
    await type('Maria');
    await flush(310);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(i18n.t('common.searchSelectLoadError'));
    expect(container.textContent).not.toContain('private technical error');
    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === i18n.t('common.retry')
    )!;
    await act(async () => retry.click());
    await flush();
    expect(labels()).toEqual(['Maria Silva']);
    expect(changed).not.toHaveBeenCalled();
  });
  it('blocks loading/disabled choices and does not treat composition Enter as selection', async () => {
    await render({ loading: true });
    await act(async () => input().focus());
    await key('ArrowDown');
    await key('Enter');
    expect(changed).not.toHaveBeenCalled();
    expect(input().getAttribute('aria-busy')).toBe('true');
    await render();
    await type('Maria S');
    await key('Enter', true);
    expect(changed).not.toHaveBeenCalled();
    await render({ disabled: true });
    expect(input().disabled).toBe(true);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});
