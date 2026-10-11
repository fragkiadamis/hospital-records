// Tabler icons (outline) used by the app, imported as SVG markup (see the .svg loader in
// angular.json). Only icons imported here end up in the bundle: to use another one, find it on
// https://tabler.io/icons and add an import and an entry below.
import addressBook from '@tabler/icons/outline/address-book.svg';
import alertTriangle from '@tabler/icons/outline/alert-triangle.svg';
import arrowLeft from '@tabler/icons/outline/arrow-left.svg';
import bell from '@tabler/icons/outline/bell.svg';
import chevronDown from '@tabler/icons/outline/chevron-down.svg';
import chevronRight from '@tabler/icons/outline/chevron-right.svg';
import listDetails from '@tabler/icons/outline/list-details.svg';
import mail from '@tabler/icons/outline/mail.svg';
import mapPin from '@tabler/icons/outline/map-pin.svg';
import message from '@tabler/icons/outline/message.svg';
import moon from '@tabler/icons/outline/moon.svg';
import pencil from '@tabler/icons/outline/pencil.svg';
import phone from '@tabler/icons/outline/phone.svg';
import photoScan from '@tabler/icons/outline/photo-scan.svg';
import plus from '@tabler/icons/outline/plus.svg';
import printer from '@tabler/icons/outline/printer.svg';
import refresh from '@tabler/icons/outline/refresh.svg';
import search from '@tabler/icons/outline/search.svg';
import stethoscope from '@tabler/icons/outline/stethoscope.svg';
import sun from '@tabler/icons/outline/sun.svg';
import trash from '@tabler/icons/outline/trash.svg';
import upload from '@tabler/icons/outline/upload.svg';
import user from '@tabler/icons/outline/user.svg';
import world from '@tabler/icons/outline/world.svg';
import x from '@tabler/icons/outline/x.svg';

export const ICONS = {
  'address-book': addressBook,
  'alert-triangle': alertTriangle,
  'arrow-left': arrowLeft,
  bell,
  'chevron-down': chevronDown,
  'chevron-right': chevronRight,
  'list-details': listDetails,
  mail,
  'map-pin': mapPin,
  message,
  moon,
  pencil,
  phone,
  'photo-scan': photoScan,
  plus,
  printer,
  refresh,
  search,
  stethoscope,
  sun,
  trash,
  upload,
  user,
  world,
  x,
} as const;

/** The icons <app-icon> knows; a name not listed here is a compile error. */
export type IconName = keyof typeof ICONS;
