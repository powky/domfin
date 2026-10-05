import { Check, ChevronDown, type LucideIcon } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { elevation } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type SelectOption<T extends string> = { value: T; label: string };

export type SelectProps<T extends string> = {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  icon?: LucideIcon;
  accessibilityLabel?: string;
  hideIconOnPhone?: boolean;
  /** A square button with just the icon, for a row of actions on a phone. Needs `accessibilityLabel`. */
  iconOnly?: boolean;
  /** Shown on the button while `value` is none of the options, like an action's name. */
  placeholder?: string;
  /** Replaces the button: what shows (like a table cell's text), opening the menu when pressed. */
  trigger?: ReactNode;
  /** The trigger's look, and when hovered. */
  triggerStyle?: StyleProp<ViewStyle>;
  triggerHoverStyle?: StyleProp<ViewStyle>;
};

type Anchor = { x: number; y: number; width: number; height: number };

const MENU_MAX_HEIGHT = 320;
const MENU_OFFSET = 4;
const SCREEN_MARGIN = 8;

/** Dropdown button with a floating menu anchored below it (or above, when there is no room). */
export function Select<T extends string>({
  options,
  value,
  onChange,
  icon,
  accessibilityLabel,
  hideIconOnPhone,
  iconOnly,
  placeholder,
  trigger,
  triggerStyle,
  triggerHoverStyle,
}: SelectProps<T>) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const viewport = useWindowDimensions();
  const anchorRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const selected = options.find((option) => option.value === value);

  const open = () => anchorRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  const close = () => setAnchor(null);

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        {trigger !== undefined ? (
          <Touchable
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            surfaceStyle={triggerStyle}
            hoverStyle={triggerHoverStyle}
          >
            {trigger}
          </Touchable>
        ) : (
          <Button
            icon={icon}
            hideIconOnPhone={hideIconOnPhone}
            iconOnly={iconOnly}
            label={iconOnly ? undefined : (selected?.label ?? placeholder)}
            trailingIcon={iconOnly ? undefined : ChevronDown}
            onPress={open}
            accessibilityLabel={accessibilityLabel}
          />
        )}
      </View>
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.closeMenu')} />
        {anchor ? (
          <View style={[styles.menu, menuPlacement(anchor, viewport)]}>
            <ScrollView
              style={{ maxHeight: menuMaxHeight(anchor, viewport) }}
              contentContainerStyle={styles.menuContent}
              bounces={false}
            >
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Touchable
                    key={option.value}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(option.value);
                      close();
                    }}
                    surfaceStyle={styles.item}
                    hoverStyle={styles.itemHovered}
                    pressedStyle={styles.itemHovered}
                  >
                    <Text variant={active ? 'bodyStrong' : 'body'} style={styles.itemLabel}>
                      {option.label}
                    </Text>
                    {active ? <Check size={16} strokeWidth={2} color={theme.colors.accent.default} /> : null}
                  </Touchable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

type Viewport = { width: number; height: number };

const spaceBelow = (anchor: Anchor, viewport: Viewport) =>
  viewport.height - (anchor.y + anchor.height + MENU_OFFSET) - SCREEN_MARGIN;
const spaceAbove = (anchor: Anchor) => anchor.y - MENU_OFFSET - SCREEN_MARGIN;
const opensUp = (anchor: Anchor, viewport: Viewport) =>
  spaceBelow(anchor, viewport) < MENU_MAX_HEIGHT && spaceAbove(anchor) > spaceBelow(anchor, viewport);

function menuMaxHeight(anchor: Anchor, viewport: Viewport) {
  const room = opensUp(anchor, viewport) ? spaceAbove(anchor) : spaceBelow(anchor, viewport);
  return Math.min(MENU_MAX_HEIGHT, room);
}

/** Keeps the menu on screen: anchors to the button's right edge on the right half of the window. */
function menuPlacement(anchor: Anchor, viewport: Viewport): ViewStyle {
  const vertical: ViewStyle = opensUp(anchor, viewport)
    ? { bottom: viewport.height - anchor.y + MENU_OFFSET }
    : { top: anchor.y + anchor.height + MENU_OFFSET };
  const horizontal: ViewStyle =
    anchor.x + anchor.width / 2 > viewport.width / 2
      ? { right: viewport.width - (anchor.x + anchor.width) }
      : { left: anchor.x };
  return { ...vertical, ...horizontal, minWidth: anchor.width, maxWidth: viewport.width - SCREEN_MARGIN * 2 };
}

const styles = StyleSheet.create((theme) => ({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menu: {
    position: 'absolute',
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    ...elevation.menu,
  },
  menuContent: {
    padding: theme.space[1],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[2],
    borderRadius: theme.radius.sm,
  },
  itemHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  itemLabel: {
    flex: 1,
  },
}));
