import type { AppTheme } from '@/theme';

import type { CashFlowSummary, FlowItem } from '../types';
import type { LabelPlacement, SankeyLinkInput, SankeyNodeInput } from './sankey';

export type FlowGrouping = 'groups' | 'categories' | 'both';

export type FlowNodeMeta = {
  id: string;
  title: string;
  amount: number;
  share: number;
};

export type FlowGraph = {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
  meta: Record<string, FlowNodeMeta>;
  columns: number;
};

/** Titles of the Income, Savings, Investments, Loans and "from your accounts" nodes, in the app language. */
export type FlowLabels = { income: string; savings: string; investments: string; loans: string; drawn: string };

const INCOME_NODE = '__income__';
const SAVINGS_NODE = '__savings__';
const INVESTMENTS_NODE = '__investments__';
const LOANS_NODE = '__loans__';
const DRAWN_NODE = '__drawn__';

/** Builds the Sankey graph for the "Where the money went" card. */
export function buildFlowGraph(
  summary: CashFlowSummary,
  grouping: FlowGrouping,
  theme: AppTheme,
  labels: FlowLabels,
): FlowGraph {
  const chart = theme.colors.chart;
  const total = summary.income.total;
  const nodes: SankeyNodeInput[] = [];
  const links: SankeyLinkInput[] = [];
  const meta: Record<string, FlowNodeMeta> = {};
  const lastColumn = grouping === 'both' ? 3 : 2;

  const addNode = (item: Pick<FlowItem, 'id' | 'label' | 'amount'>, column: number, color: string, label: LabelPlacement) => {
    nodes.push({ id: item.id, column, color, label });
    meta[item.id] = { id: item.id, title: item.label, amount: item.amount, share: total > 0 ? item.amount / total : 0 };
  };
  const linkColor = (color: string) => `${color}40`;

  for (const source of summary.income.byCategory) {
    addNode(source, 0, chart.income, 'left');
    links.push({ source: source.id, target: INCOME_NODE, value: source.amount, color: chart.incomeLink });
  }

  // More went out (to expenses and investments) than came in: the loans
  // received in the period cover it first, and the rest came from what your
  // accounts already had or from your cards.
  const drawn = Math.max(-summary.kept, 0);
  const fromLoans = Math.min(summary.borrowed, drawn);
  const fromAccounts = drawn - fromLoans;
  if (fromLoans > 0) {
    addNode({ id: LOANS_NODE, label: labels.loans, amount: fromLoans }, 0, chart.pink, 'left');
    links.push({ source: LOANS_NODE, target: INCOME_NODE, value: fromLoans, color: linkColor(chart.pink) });
  }
  if (fromAccounts > 0) {
    addNode({ id: DRAWN_NODE, label: labels.drawn, amount: fromAccounts }, 0, chart.slate, 'left');
    links.push({ source: DRAWN_NODE, target: INCOME_NODE, value: fromAccounts, color: linkColor(chart.slate) });
  }

  addNode({ id: INCOME_NODE, label: labels.income, amount: total }, 1, chart.income, 'top');

  // What you saved and didn't invest.
  if (summary.kept > 0) {
    addNode({ id: SAVINGS_NODE, label: labels.savings, amount: summary.kept }, 2, chart.savings, 'right');
    links.push({ source: INCOME_NODE, target: SAVINGS_NODE, value: summary.kept, color: linkColor(chart.savings) });
  }

  const investments = summary.investments;
  if (investments.total > 0) {
    const color = chart.darkGreen;
    if (grouping === 'categories') {
      for (const item of investments.byDestination) {
        addNode(item, lastColumn, color, 'right');
        links.push({ source: INCOME_NODE, target: item.id, value: item.amount, color: linkColor(color) });
      }
    } else {
      addNode({ id: INVESTMENTS_NODE, label: labels.investments, amount: investments.total }, 2, color, 'right');
      links.push({ source: INCOME_NODE, target: INVESTMENTS_NODE, value: investments.total, color: linkColor(color) });
      if (grouping === 'both') {
        for (const item of investments.byDestination) {
          addNode(item, 3, color, 'right');
          links.push({ source: INVESTMENTS_NODE, target: item.id, value: item.amount, color: linkColor(color) });
        }
      }
    }
  }

  for (const group of summary.expenses.byGroup) {
    const color = chart[group.color];
    if (grouping === 'categories') {
      for (const category of group.categories) {
        addNode(category, lastColumn, color, 'right');
        links.push({ source: INCOME_NODE, target: category.id, value: category.amount, color: linkColor(color) });
      }
      continue;
    }

    addNode(group, 2, color, 'right');
    links.push({ source: INCOME_NODE, target: group.id, value: group.amount, color: linkColor(color) });

    if (grouping === 'both') {
      for (const category of group.categories) {
        addNode(category, 3, color, 'right');
        links.push({ source: group.id, target: category.id, value: category.amount, color: linkColor(color) });
      }
    }
  }

  return { nodes, links, meta, columns: lastColumn + 1 };
}
