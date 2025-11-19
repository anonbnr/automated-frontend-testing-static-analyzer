import { RowWidgetInfo, WidgetInfo } from "../../../models/widget-info.js";

export function makeWidgetsTree(widgets: WidgetInfo[], _currentWidgets?: WidgetInfo[]) {
    let sortedWidgets: WidgetInfo[] = [];

    if(Array.isArray(_currentWidgets) && _currentWidgets.length === 0)
        return [];
    
    if (_currentWidgets === undefined) {
        for (const widget of widgets) {
            if (widget.parentId === null) {
                sortedWidgets.push(widget);
                widget.children = makeWidgetsTree(widgets, sortedWidgets);
            }
        }
    }
    else {
        for (const widget of widgets) {
            if (_currentWidgets.filter( x => x.id === widget.parentId).length) {
                sortedWidgets.push(widget);
                widget.children = makeWidgetsTree(widgets, sortedWidgets);
            }
        }
    }

    return sortedWidgets;
}

export function flattenWidgets(widgets: WidgetInfo[]): WidgetInfo[] {
    const result: WidgetInfo[] = [];

    for (const widget of widgets) {
        result.push(widget);

        if (widget.children && widget.children.length > 0) {
            result.push(...flattenWidgets(widget.children));
        }
    }

    return result;
}