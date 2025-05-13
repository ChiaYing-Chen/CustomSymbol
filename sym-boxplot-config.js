// 參考 xyplot，簡化為僅支援 Y（單一資料來源類型），不需 X/Y 配對
(function (PV) {
    'use strict';
    PV.BoxplotConfig = (function () {
        var _seriesPalette = ['#3e98d3', '#e08a00', '#b26bff', '#2fbcb8', '#db4646', '#9c806e', '#3cbf3c', '#c5560d', '#2e20ee', '#a52056', '#96892d', '#6e90d3'];
        function init(scope) {
            var runtimeData = scope.runtimeData;
            var dataSources = scope.symbol.DataSources;
            // 建立 tableRows 結構，每個資料來源一列，並自動分配顏色
            runtimeData.tableRows = [];
            (dataSources || []).forEach(function(ds, idx) {
                var defaultBoxColor = _seriesPalette[idx % _seriesPalette.length];
                if (!scope.config.DataSettings) scope.config.DataSettings = [];
                if (!scope.config.DataSettings[idx]) scope.config.DataSettings[idx] = {};
                // getter/setter 實作，確保 ng-model 雙向同步
                var row = {
                    index: idx,
                    y: [{
                        index: idx,
                        label: ds.Label || ds.Name || ds.Path || ('Tag' + idx),
                        boxColor: function(value) {
                            if (value !== undefined) scope.config.DataSettings[idx].BoxColor = value;
                            if (!scope.config.DataSettings[idx].BoxColor) scope.config.DataSettings[idx].BoxColor = defaultBoxColor;
                            return scope.config.DataSettings[idx].BoxColor;
                        }
                    }],
                    getConfigItems: function() { return this.y; },
                    select: function() { runtimeData.currentRowIndex = this.index; }
                };
                runtimeData.tableRows.push(row);
            });
            // 讓 config.html 的 ng-model 綁定正確（直接用 DataSettings）
            runtimeData.getBoxColor = function(idx) { return scope.config.DataSettings[idx].BoxColor; };
            runtimeData.setBoxColor = function(idx, val) { scope.config.DataSettings[idx].BoxColor = val; };
            if (isNaN(runtimeData.currentRowIndex) || runtimeData.currentRowIndex >= runtimeData.tableRows.length) {
                runtimeData.currentRowIndex = 0;
            }
            if (runtimeData.tableRows.length > 0) {
                runtimeData.tableRows[runtimeData.currentRowIndex].select();
            }
            // 刪除/排序功能
            runtimeData.deleteTableRow = function() {
                if (runtimeData.tableRows.length <= 1) return;
                var idx = runtimeData.currentRowIndex;
                scope.symbol.DataSources.splice(idx, 1);
                if (scope.config.DataSettings) scope.config.DataSettings.splice(idx, 1);
                runtimeData.tableRows.splice(idx, 1);
                if (runtimeData.currentRowIndex >= runtimeData.tableRows.length) runtimeData.currentRowIndex = runtimeData.tableRows.length - 1;
            };
            runtimeData.moveTableRow = function(action) {
                var idx = runtimeData.currentRowIndex;
                if (action === 'up' && idx > 0) {
                    swap(idx, idx - 1);
                    runtimeData.currentRowIndex = idx - 1;
                } else if (action === 'down' && idx < runtimeData.tableRows.length - 1) {
                    swap(idx, idx + 1);
                    runtimeData.currentRowIndex = idx + 1;
                }
                function swap(i, j) {
                    var t = scope.symbol.DataSources[i];
                    scope.symbol.DataSources[i] = scope.symbol.DataSources[j];
                    scope.symbol.DataSources[j] = t;
                    if (scope.config.DataSettings) {
                        var td = scope.config.DataSettings[i];
                        scope.config.DataSettings[i] = scope.config.DataSettings[j];
                        scope.config.DataSettings[j] = td;
                    }
                    var tr = runtimeData.tableRows[i];
                    runtimeData.tableRows[i] = runtimeData.tableRows[j];
                    runtimeData.tableRows[j] = tr;
                }
            };
        }
        // Getter/setter for DataSettings
        function currentDataSetting(config, idx, property, defaultValue, value) {
            var dataSettings = config.DataSettings;
            if (value === undefined) {
                if (dataSettings && dataSettings[idx] && dataSettings[idx].hasOwnProperty(property)) {
                    return dataSettings[idx][property];
                }
                return defaultValue;
            }
            if (!dataSettings) dataSettings = config.DataSettings = [];
            if (!dataSettings[idx]) dataSettings[idx] = {};
            dataSettings[idx][property] = value;
            return value;
        }
        return { init: init };
    }());
})(window.PIVisualization);