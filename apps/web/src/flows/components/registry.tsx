import type { ComponentType, ReactNode } from 'react';
import type { FlowComponent } from '../schema';
import { CalendarPicker } from './CalendarPicker';
import { ChipsSelector } from './ChipsSelector';
import { DatePicker } from './DatePicker';
import { EmbeddedLink, Image, ImageCarousel } from './display';
import { Footer } from './Footer';
import { NavigationList } from './NavigationList';
import { If, Switch } from './structural';
import { CheckboxGroup, Dropdown, OptIn, RadioButtonsGroup, TextArea, TextInput } from './inputs';
import { RichText, TextBody, TextCaption, TextHeading, TextSubheading } from './text';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Renderer = ComponentType<{ c: any }>;

const COMPONENTS: Record<string, Renderer> = {
  TextHeading,
  TextSubheading,
  TextBody,
  TextCaption,
  RichText,
  TextInput,
  TextArea,
  CheckboxGroup,
  RadioButtonsGroup,
  Dropdown,
  OptIn,
  DatePicker,
  CalendarPicker,
  ChipsSelector,
  Image,
  EmbeddedLink,
  ImageCarousel,
  NavigationList,
  Footer,
  If,
  Switch,
};

const warned = new Set<string>();

/** Test hook: forget which unknown types were already reported. */
export function resetUnknownWarnings(): void {
  warned.clear();
}

/** Unknown types render nothing; the type is reported once. */
export function renderComponent(c: FlowComponent, key: string): ReactNode {
  const Component = Object.hasOwn(COMPONENTS, c.type) ? COMPONENTS[c.type] : undefined;
  if (!Component) {
    if (!warned.has(c.type)) {
      warned.add(c.type);
      console.warn(`Flow component type not supported: ${c.type}`);
    }
    return null;
  }
  return <Component key={key} c={c} />;
}
