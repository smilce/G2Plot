import * as _ from '@antv/util';
import { registerPlotType } from '../../base/global';
import { LayerConfig } from '../../base/layer';
import ViewLayer, { ViewConfig } from '../../base/view-layer';
import { getComponent } from '../../components/factory';
import squarify from './layout/squarify';
import { INTERACTION_MAP } from './interaction';
import './components/label';

const PARENT_NODE_OFFSET = 4;
const BLOCK_MARGIN = 4;

export interface TreemapViewConfig extends ViewConfig {
  data: any;
  maxLevel?: number;
  colorField: string;
}

export interface TreemapLayerConfig extends TreemapViewConfig, LayerConfig {}

export default class TreemapLayer<T extends TreemapLayerConfig = TreemapLayerConfig> extends ViewLayer<T> {
  public static getDefaultOptions(): Partial<TreemapLayerConfig> {
    return _.deepMix({}, super.getDefaultOptions(), {
      maxLevel: 2,
      padding: [0, 0, 0, 0],
      tooltip: {
        visible: false,
      },
      legend: {
        visible: false,
      },
      xAxis: {
        visible: false,
      },
      yAxis: {
        visible: false,
      },
      xField: 'x',
      yField: 'y',
      label: {
        visible: true,
        adjustPosition: true,
        style: {
          stroke: 'rgba(0,0,0,0)',
          lineWidth: 0,
          fontSize: 12,
        },
      },
      meta: {
        x: {
          nice: false,
        },
        y: {
          nice: false,
        },
      },
    });
  }
  public type: string = 'line';

  public beforeInit() {
    const { interactions } = this.options;
    if (interactions) {
      _.each(interactions, (interaction) => {
        if (interaction.type === 'drilldown') {
          this.options.maxLevel = 1;
        }
      });
    }
  }

  protected geometryParser(dim, type) {
    return 'polygon';
  }

  public getTreemapData(data, level?) {
    const { colorField } = this.options;
    const viewRange = this.getViewRange();
    const root = squarify(data, viewRange.x, viewRange.y, viewRange.width, viewRange.height);
    /*_.each(root, (r) => {
      if (!_.hasKey(r, colorField) && r.children) {
        r[colorField] = r.children[0][colorField];
      }
    });*/
    this.recursive(root, 1);
    const treemapData = [];
    this.getAllNodes(root, treemapData, level);
    treemapData.sort((a, b) => {
      return a.depth - b.depth;
    });
    this.options.xField = 'x';
    this.options.yField = 'y';
    return treemapData;
  }

  protected processData() {
    const { data, colorField } = this.options;
    const treemapData = this.getTreemapData(data);
    return treemapData;
  }

  protected coord() {}

  protected addGeometry() {
    const { maxLevel } = this.options;
    const rect: any = {
      type: 'polygon',
      position: {
        fields: ['x', 'y'],
      },
      color: {
        fields: [this.options.colorField],
      },
      style: {
        fields: ['depth'],
        callback: (d) => {
          if (d === 1) {
            return {
              lineWidth: 1,
              stroke: 'black',
              opacity: d / maxLevel,
            };
          }
          return {
            lineWidth: 1,
            stroke: 'rgba(0,0,0,0.3)',
            opacity: d / maxLevel,
          };
        },
      },
      label: this.extractLabel(),
    };
    this.setConfig('element', rect);
  }

  protected applyInteractions() {
    const interactionCfg = this.options.interactions;
    const interactions = this.view.get('interactions');
    _.each(interactionCfg, (inter) => {
      const Ctr = INTERACTION_MAP[inter.type];
      if (Ctr) {
        const interaction = new Ctr(
          _.deepMix(
            {},
            {
              view: this.view,
              plot: this,
              startEvent: 'polygon:click',
            },
            inter.cfg
          )
        );
        interactions[inter.type] = interaction;
      }
    });
  }

  private extractLabel() {
    const labelOptions = this.options.label;
    // 不显示label的情况
    if (!labelOptions.visible) {
      return false;
    }
    const label = getComponent('label', {
      labelType: 'treemapLabel',
      plot: this,
      top: true,
      fields: ['name'],
      maxLevel: this.options.maxLevel,
      ...labelOptions,
    });
    return label;
  }

  private recursive(rows, depth?) {
    const { colorField } = this.options;
    _.each(rows, (r) => {
      _.each(r.children, (c) => {
        c.depth = depth;
        if (depth > 1) c.parent = r;
        if (!_.hasKey(c, colorField)) {
          c[colorField] = r[colorField];
        }
        c.showLabel = true;
        const leaf = this.isLeaf(c);
        if (!leaf) {
          const cliperHeight = Math.abs(c.y1 - c.y0);
          const labelHeight = this.getLabelHeight();
          const parentLabelOffset = cliperHeight / 2 > labelHeight ? labelHeight : BLOCK_MARGIN;
          c.showLabel = parentLabelOffset === BLOCK_MARGIN ? false : true;
          const c_rows = squarify(
            c,
            c.x0 + BLOCK_MARGIN,
            c.y0 + parentLabelOffset,
            c.x1 - BLOCK_MARGIN,
            c.y1 - BLOCK_MARGIN
          );
          this.fillColorField(c_rows, colorField, c[colorField]);
          this.recursive(c_rows, c.depth + 1);
        }
      });
    });
  }

  private getAllNodes(data, nodes, level?) {
    const max = level ? level : this.options.maxLevel;
    const viewRange = this.getViewRange();
    _.each(data, (d) => {
      if (_.hasKey(d, 'x0') && d.depth <= max) {
        nodes.push({
          ...d,
          x: [d.x0, d.x1, d.x1, d.x0],
          y: [viewRange.height - d.y1, viewRange.height - d.y1, viewRange.height - d.y0, viewRange.height - d.y0],
        });
      }
      if (_.hasKey(d, 'children')) {
        this.getAllNodes(d.children, nodes);
      }
    });
  }

  private fillColorField(rows, fieldName, value) {
    _.each(rows, (r) => {
      if (!_.hasKey(r, fieldName)) {
        r[fieldName] = value;
      }
    });
  }

  private getLabelHeight() {
    // tempo: 暂时先用绝对值
    return 12 + PARENT_NODE_OFFSET * 2;
  }

  private isLeaf(data) {
    return !data.children /*|| data.depth >= this.options.maxLevel*/;
  }
}

registerPlotType('treemap', TreemapLayer);
