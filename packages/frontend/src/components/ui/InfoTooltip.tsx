import * as Tooltip from '@radix-ui/react-tooltip';
import { ReactNode } from 'react';

interface Props {
  content: string;
  children?: ReactNode;
}

export default function InfoTooltip({ content, children }: Props) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {children || (
            <button className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 ml-1.5 align-middle">
              i
            </button>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-[100] max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-[13px] leading-relaxed text-slate-600 shadow-xl animate-in fade-in zoom-in-95 duration-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            sideOffset={5}
          >
            {content}
            <Tooltip.Arrow className="fill-white dark:fill-slate-800" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
