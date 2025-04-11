declare module 'react-calendar-timeline' {
  import * as React from 'react';

  export interface TimelineGroupBase {
    id: string | number;
    title: React.ReactNode;
    rightTitle?: React.ReactNode;
    height?: number;
    stackItems?: boolean;
  }

  export interface TimelineItemBase {
    id: string | number;
    group: string | number;
    title?: React.ReactNode;
    start_time: number;
    end_time: number;
    canMove?: boolean;
    canResize?: boolean | 'left' | 'right' | 'both';
    canChangeGroup?: boolean;
    className?: string;
    style?: React.CSSProperties;
    itemProps?: any;
  }

  export interface TimelineProps {
    groups: TimelineGroupBase[];
    items: TimelineItemBase[];
    visibleTimeStart: number;
    visibleTimeEnd: number;
    canMove?: boolean;
    canResize?: boolean | 'left' | 'right' | 'both';
    canChangeGroup?: boolean;
    stackItems?: boolean;
    lineHeight?: number;
    itemHeightRatio?: number;
    sidebarWidth?: number;
    minResizeWidth?: number;
    className?: string;
    style?: React.CSSProperties;
    onTimeChange?: (visibleTimeStart: number, visibleTimeEnd: number) => void;
    onItemClick?: (itemId: string | number, e: React.MouseEvent) => void;
    onItemSelect?: (itemId: string | number, e: React.MouseEvent, time: number) => void;
    onItemContextMenu?: (itemId: string | number, e: React.MouseEvent) => void;
    onItemMove?: (itemId: string | number, dragTime: number, newGroupId: string | number) => void;
    onItemResize?: (itemId: string | number, time: number, edge: 'left' | 'right') => void;
  }

  declare const Timeline: React.ComponentType<TimelineProps>;

  export default Timeline;
} 