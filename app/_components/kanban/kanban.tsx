/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { Card } from '@/app/_components/ui/card';
import { cn } from '@/app/_lib/utils';
import type { ReactNode } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

export type Status = {
  id: string;
  name: string;
  color: string;
};

export type Feature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: Status;
};

export type KanbanBoardProps = {
  id: Status['id'];
  children: ReactNode;
  className?: string;
  style?: {
    backgroundColor: string;
    border: string;
  };
  isCollapsed?: boolean;
  toggleCollapse?: () => void;
  cardCount?: number; // Nova propriedade para a contagem de cards
};

export const KanbanBoard = ({
  id,
  children,
  className,
  style,
  isCollapsed,
  toggleCollapse,
  cardCount, // Adiciona cardCount
}: KanbanBoardProps) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-secondary p-2 text-xs shadow-sm h-auto sm:h-[500px] overflow-y-auto ",
        className
      )}
      style={style}
    >
      <KanbanHeader
        name={id}
        color={style?.backgroundColor || '#FFFFFF'}
        isCollapsed={isCollapsed || false}
        toggleCollapse={toggleCollapse}
        className="text-[#ffffff] font-semibold uppercase"
        cardCount={cardCount} // Passa cardCount para o KanbanHeader
      />
      {!isCollapsed && children}
    </div>
  );
};

export type KanbanCardProps = Pick<Feature, 'id' | 'name'> & {
  index: number;
  parent: string;
  children?: ReactNode;
  className?: string;
};

export const KanbanCard = ({
  id,
  name,
  index,
  parent,
  children,
  className,
}: KanbanCardProps) => {
  return (
    <Card
      className={cn('rounded-xl p-2 sm:p-3 shadow-sm', className)}
      style={{ backgroundColor: '#FFFFFF', color: '#000000' }}
    >
      {children ?? <p className="m-0 font-medium text-xs sm:text-sm">{name}</p>}
    </Card>
  );
};

export type KanbanCardsProps = {
  children: ReactNode;
  className?: string;
};

export const KanbanCards = ({ children, className }: KanbanCardsProps) => (
  <div className={cn('flex flex-1 flex-col gap-2', className)}>
    {children}
  </div>
);

export type KanbanHeaderProps =
  | {
      children: ReactNode;
    }
  | {
      name: Status['name'];
      color: Status['color'];
      className?: string;
      isCollapsed?: boolean;
      toggleCollapse?: () => void;
      cardCount?: number; // Nova propriedade para a contagem
    };

export const KanbanHeader = (props: KanbanHeaderProps) =>
  'children' in props ? (
    props.children
  ) : (
    <div
      className={cn(
        'flex items-center gap-2',
        props.isCollapsed ? 'flex-col items-center justify-center' : 'flex-row',
        props.className
      )}
    >
      {props.isCollapsed ? (
        <div className="flex flex-col items-center justify-center w-[50px] h-auto">
          <button
            onClick={props.toggleCollapse}
            className="flex flex-col items-center justify-center text-[10px] font-semibold"
            style={{ width: '50px', height: 'auto' }}
          >
            <FaChevronRight className="text-[12px] mb-1" />
            <span
              className="inline-block text-[14px] mt-2 font-semibold truncate"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', maxWidth: '40px' }}
            >
              {props.cardCount !== undefined ? `(${props.cardCount}) ${props.name}` : props.name}
            </span>
          </button>
        </div>
      ) : (
        <>
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: props.color }}
          />
          <p className="m-0 font-semibold text-xs sm:text-sm">
            {props.cardCount !== undefined ? `(${props.cardCount}) ${props.name}` : props.name}
          </p>
          <button
            onClick={props.toggleCollapse}
            className="ml-auto text-xs sm:text-sm font-semibold"
          >
            <FaChevronLeft className="text-sm" />
          </button>
        </>
      )}
    </div>
  );

export type KanbanProviderProps = {
  children: ReactNode;
  className?: string;
};

export const KanbanProvider = ({
  children,
  className,
}: KanbanProviderProps) => (
  <div className={cn('flex flex-col sm:flex-row sm:gap-4', className)}>
    {children}
  </div>
);