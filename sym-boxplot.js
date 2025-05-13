//這個程式用於AVEVA PI Vision的Boxplot圖表,
//PI Vision Extensibility的說明可以參閱GitHub上的文件
//https://github.com/AVEVA/AVEVA-Samples-PI-System/blob/main/docs/PI-Vision-Extensibility-Docs/PI%20Vision%20Extensibility%20Guide.md
(function (CS) {
    var symbolDefinition = {
        typeName: 'boxplot',
        displayName: 'Boxplot',
        datasourceBehavior: CS.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/boxplot.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'TimeSeries',
                Height: 300,
                Width: 600,
                Segment: 8, // 區段數，取代原本的 Interval
                BoxColor: "#007bff",
                WhiskerColor: "#6c757d",
                YAxisMin: "",      // 新增 Y 軸最小值
                YAxisMax: "",      // 新增 Y 軸最大值
                YAxisStep: "",     // 新增 Y 軸刻度間距
                DataQueryMode: 'ModePlotValues', // 新增，預設用PlotValues
                Intervals: 100,    // 取樣點數，由系統根據時間範圍和取樣頻率計算
                IntervalValue: 1,  // 取樣頻率值
                IntervalType: 'm'  // 取樣頻率單位
            };
        },
        configOptions: function () {
            return [{
                title: 'Format Symbol',
                mode: 'custom', // CHANGED from 'format'
                configTemplate: 'sym-boxplot-config.html' // ADDED
            }];
        }
    };

    function symbolVis() { }
    CS.deriveVisualizationFromBase(symbolVis);

    symbolVis.prototype.init = function (scope, elem) {
        this.scope = scope; // 儲存 scope 供 onDataUpdate 使用
        var chartDiv = elem.find('#boxplot-container')[0];
        if (chartDiv) chartDiv.innerHTML = '<div style="color:#fff;font-size:32px;text-align:center;padding-top:40px;">HELLO</div>';
        
        // 確保刪除舊的 Interval 參數，避免與 Segment 混淆
        if (this.scope && this.scope.config && this.scope.config.Interval !== undefined) {
            if (window.console) console.log('[Boxplot init] 刪除舊的 Interval 參數，改用 Segment');
            delete this.scope.config.Interval;
        }
        
        // 確保系統使用 config.Intervals 進行資料查詢
        if (this.scope && this.scope.symbol && this.scope.symbol.dataParams) {
            this.scope.symbol.dataParams.Intervals = this.scope.config.Intervals;
            
            // 刪除可能存在的 Interval 參數 (dataParams層)
            if (this.scope.symbol.dataParams.Interval !== undefined) {
                delete this.scope.symbol.dataParams.Interval;
            }
            
            if (window.console) console.log('[Boxplot init] 設定資料查詢參數 Intervals =', this.scope.config.Intervals);
        }
          // 載入 d3.js
        if (!window.d3 || !window.d3.version || !window.d3.version.startsWith("5")) {
            var script = document.createElement('script');
            script.src = '/Scripts/app/editor/symbols/ext/d3.v5.min.js';
            document.head.appendChild(script);
        }
        
        // 強制設定DataQueryMode為ModePlotValues
        if(this.scope && this.scope.config) {
            this.scope.config.DataQueryMode = 'ModePlotValues';
            
            // 記錄當前 d3.js 版本，幫助診斷問題
            if (window.console && window.d3) {
                console.log('[Boxplot init] 使用的 d3.js 版本:', window.d3.version, 
                           'mouse函數存在:', !!window.d3.mouse,
                           'pointer函數存在:', !!window.d3.pointer,
                           'event物件存在:', !!window.d3.event);

                // 新增：如果 d3.pointer 不存在，則提供 polyfill
                if (!window.d3.pointer) {
                    if (window.console) console.log('[Boxplot init] d3.pointer is missing, providing polyfill.');
                    window.d3.pointer = function(event, container) {
                        if (!event) {
                            if (window.console) console.warn('[Boxplot d3.pointer polyfill] Received null or undefined event object.');
                            return [0, 0]; // Cannot proceed
                        }

                        var target = container || document.documentElement;
                        var rect;
                        try {
                            rect = target.getBoundingClientRect();
                        } catch (e) {
                            if (window.console) console.warn('[Boxplot d3.pointer polyfill] Error getting bounding client rect for target:', target, e);
                            return [0,0];
                        }
                        
                        var x_coord = event.clientX;
                        var y_coord = event.clientY;

                        if (event.changedTouches && event.changedTouches.length > 0) {
                            x_coord = event.changedTouches[0].clientX;
                            y_coord = event.changedTouches[0].clientY;
                        }
                        
                        if (typeof x_coord !== 'number' || typeof y_coord !== 'number' || isNaN(x_coord) || isNaN(y_coord)) {
                            if(window.console) console.warn('[Boxplot d3.pointer polyfill] Event does not have valid clientX/clientY. x:', x_coord, 'y:', y_coord, 'event:', event);
                            return [0,0]; 
                        }
                        
                        return [
                            x_coord - rect.left,
                            y_coord - rect.top
                        ];
                    };
                }
            }

            // 嘗試獲取 PI Vision 時間區間：從全局變數 PV, PVTimeSelection 或 PVDisplayEngine
            var getDisplayTimeRange = function() {
                var start, end;
                try {
                    // 嘗試方法1：PV.TimeService
                    if (window.PV && window.PV.TimeService) {
                        start = window.PV.TimeService.getStartTimeForDisplay();
                        end = window.PV.TimeService.getEndTimeForDisplay();
                    }
                    // 嘗試方法2：PVTimeSelection
                    else if (window.PVTimeSelection) {
                        start = window.PVTimeSelection.getStartTime();
                        end = window.PVTimeSelection.getEndTime();
                    }
                    // 嘗試方法3：PVDisplayEngine
                    else if (window.PVDisplayEngine) {
                        start = window.PVDisplayEngine.getTimeService().getStartTimeForDisplay();
                        end = window.PVDisplayEngine.getTimeService().getEndTimeForDisplay();
                    }

                    if (start && end) {
                        return { start: start, end: end };
                    }
                } catch(ex) {
                    if (window.console) console.error('[Boxplot] 無法取得 PI Vision 時間區間:', ex);
                }

                // 若無法取得，給 8 小時預設值
                var now = new Date();
                var then = new Date(now.getTime() - 8 * 3600 * 1000);
                return {
                    start: then.toISOString(),
                    end: now.toISOString()
                };
            };

            // 確保 config 有開始和結束時間
            var timeRange = getDisplayTimeRange();
            if (!scope.config.startTime && !scope.config.StartTime) {
                scope.config.startTime = timeRange.start;
            }
            if (!scope.config.endTime && !scope.config.EndTime) {
                scope.config.endTime = timeRange.end;
            }

            // 自動換算取樣間隔（IntervalValue + IntervalType 轉秒數）
            var getSamplingIntervalSec = function() {
                var val = parseFloat(scope.config.IntervalValue);
                var type = scope.config.IntervalType || 'm';
                if (isNaN(val) || val <= 0) {
                    if (window.console) console.warn('[Boxplot getSamplingIntervalSec] IntervalValue 無效:', scope.config.IntervalValue, 'IntervalType:', scope.config.IntervalType);
                    return null;
                }
                switch(type) {
                    case 's': return val;
                    case 'm': return val * 60;
                    case 'h': return val * 3600;
                    case 'd': return val * 86400;
                    default: return val * 60;
                }
            };
            var recalcIntervals = function() {
                // 防呆：若 config 沒有 IntervalValue/IntervalType，給預設值
                if (!scope.config.IntervalValue) scope.config.IntervalValue = 1;
                if (!scope.config.IntervalType) scope.config.IntervalType = 'm';
                
                // 確保刪除舊的 Interval 參數，避免與 Segment 混淆
                if (scope.config.Interval !== undefined) {
                    if (window.console) console.log('[Boxplot recalcIntervals] 刪除舊的 Interval 參數');
                    delete scope.config.Interval;
                }
                
                // 主動獲取 PI Vision 時間區間
                var timeRange;
                try {
                    if (window.PV && window.PV.TimeService) {
                        timeRange = {
                            start: window.PV.TimeService.getStartTimeForDisplay(),
                            end: window.PV.TimeService.getEndTimeForDisplay()
                        };
                    } else if (window.PVTimeSelection) {
                        timeRange = {
                            start: window.PVTimeSelection.getStartTime(),
                            end: window.PVTimeSelection.getEndTime()
                        };
                    } else if (window.PVDisplayEngine) {
                        timeRange = {
                            start: window.PVDisplayEngine.getTimeService().getStartTimeForDisplay(),
                            end: window.PVDisplayEngine.getTimeService().getEndTimeForDisplay()
                        };
                    }
                } catch(ex) {
                    if (window.console) console.warn('[Boxplot] 嘗試獲取 PI Vision 時間區間失敗:', ex);
                }

                // 如果獲取到了時間區間，填充到 config
                if (timeRange && timeRange.start && timeRange.end) {
                    scope.config.startTime = timeRange.start;
                    scope.config.endTime = timeRange.end;
                }
                
                var samplingIntervalSec = getSamplingIntervalSec();
                var startTime = scope.config.StartTime || scope.config.startTime;
                var endTime = scope.config.EndTime || scope.config.endTime;
                
                // 若依然沒有時間區間，給出 8 小時預設值
                if (!startTime || !endTime) {
                    var now = new Date();
                    endTime = now.toISOString();
                    startTime = new Date(now.getTime() - 8 * 3600 * 1000).toISOString();
                    scope.config.startTime = startTime;
                    scope.config.endTime = endTime;
                    if (window.console) console.log('[Boxplot recalcIntervals] 使用預設時間區間: start=' + startTime + ', end=' + endTime);
                }
                
                var t0 = new Date(startTime).getTime();
                var t1 = new Date(endTime).getTime();

                if (window.console) {
                    console.log('[Boxplot recalcIntervals] samplingIntervalSec:', samplingIntervalSec, 't0:', t0, 't1:', t1, 'config:', JSON.stringify(scope.config), 'lastData:', scope.lastData);
                }
                
                if (t0 && t1 && samplingIntervalSec && !isNaN(samplingIntervalSec) && samplingIntervalSec > 0) {
                    var intervals = Math.floor((t1 - t0) / 1000 / samplingIntervalSec);
                    scope.config.Intervals = Math.max(1, intervals);
                    
                    // 同步更新系統數據查詢參數，確保查詢使用正確的 Intervals
                    if (scope.symbol && scope.symbol.dataParams) {
                        scope.symbol.dataParams.Intervals = scope.config.Intervals;
                        // 刪除可能存在的 Interval 參數
                        if (scope.symbol.dataParams.Interval !== undefined) {
                            delete scope.symbol.dataParams.Interval;
                        }
                    }
                    
                    // 不再設定 Segment = Intervals，兩者分開處理
                    if (window.console) {
                        console.log('[Boxplot recalcIntervals] Intervals set to:', scope.config.Intervals, 
                                    '(dataParams.Intervals =', (scope.symbol && scope.symbol.dataParams ? scope.symbol.dataParams.Intervals : 'N/A'), 
                                    ', Segment 維持不變:', scope.config.Segment, ')');
                    }
                    
                    // 強制更新資料，確保使用新的 Intervals
                    try {
                        if (scope.symbol && typeof scope.symbol.triggerDataUpdate === 'function') {
                            scope.symbol.triggerDataUpdate();
                            if (window.console) console.log('[Boxplot recalcIntervals] 強制更新資料');
                        }
                    } catch(ex) {
                        if (window.console) console.error('[Boxplot recalcIntervals] 強制更新資料失敗:', ex);
                    }
                } else {
                    // 僅在有資料但格式不符時才 log warning
                    if ((scope.lastData && scope.lastData.Data) || (startTime && endTime)) {
                        if (window.console) {
                            console.warn('[Boxplot recalcIntervals] 無法設定 Intervals，缺少有效資料或參數', {
                                samplingIntervalSec, t0, t1, startTime, endTime, config: scope.config, lastData: scope.lastData
                            });
                        }
                    }
                }
            };
            recalcIntervals();
            // 監聽 IntervalValue、IntervalType、StartTime、EndTime 變動，自動重算 Intervals
            if (scope.$watch) {
                scope.$watch('config.IntervalValue', recalcIntervals);
                scope.$watch('config.IntervalType', recalcIntervals);
                scope.$watch('config.StartTime', recalcIntervals);
                scope.$watch('config.EndTime', recalcIntervals);
                scope.$watch('config.startTime', recalcIntervals);
                scope.$watch('config.endTime', recalcIntervals);
            }
            // 提供外部可呼叫 recalcIntervals
            scope.recalcIntervals = recalcIntervals;
        }
    };

    symbolVis.prototype.onDataUpdate = function(data) {
        if (window.console) console.log('[Boxplot onDataUpdate] Start');
        var scope = this.scope; // 取得 scope
        // 若 config 沒有 Intervals，則根據資料自動推算
        if (scope && scope.config) {
            var getSamplingIntervalSec = function() {
                var val = parseFloat(scope.config.IntervalValue);
                var type = scope.config.IntervalType || 'm';
                if (isNaN(val) || val <= 0) return null;
                switch(type) {
                    case 's': return val;
                    case 'm': return val * 60;
                    case 'h': return val * 3600;
                    case 'd': return val * 86400;
                    default: return val * 60;
                }
            };
            
            // 計算 Intervals
            var getIntervals = function(startTime, endTime, samplingIntervalSec) {
                if (!startTime || !endTime || !samplingIntervalSec) return null;
                try {
                    var t0 = new Date(startTime).getTime();
                    var t1 = new Date(endTime).getTime();
                    if (isNaN(t0) || isNaN(t1)) return null;
                    var intervals = Math.floor((t1 - t0) / 1000 / samplingIntervalSec);
                    return Math.max(1, intervals);
                } catch(ex) {
                    if (window.console) console.error('[Boxplot] getIntervals 計算錯誤:', ex);
                    return null;
                }
            };
            
            var samplingIntervalSec = getSamplingIntervalSec();
            var t0, t1;
            // 嘗試從 config 取得時間
            var startTime = scope.config.StartTime || scope.config.startTime;
            var endTime = scope.config.EndTime || scope.config.endTime;
            // 若 config 沒有，則從資料取得
            if ((!startTime || !endTime) && data && data.Data && data.Data[0] && data.Data[0].Values && data.Data[0].Values.length > 1) {
                t0 = new Date(data.Data[0].Values[0].Time).getTime();
                t1 = new Date(data.Data[0].Values[data.Data[0].Values.length-1].Time).getTime();
                startTime = new Date(t0).toISOString();
                endTime = new Date(t1).toISOString();
                scope.config.startTime = startTime;
                scope.config.endTime = endTime;
            } else if (startTime && endTime) {
                t0 = new Date(startTime).getTime();
                t1 = new Date(endTime).getTime();
            }
            
            if (t0 && t1 && samplingIntervalSec && !isNaN(samplingIntervalSec) && samplingIntervalSec > 0) {
                var intervals = getIntervals(startTime, endTime, samplingIntervalSec);
                if (intervals) {
                    scope.config.Intervals = intervals;
                    
                    // 同步更新系統數據查詢參數
                    if (scope.symbol && scope.symbol.dataParams) {
                        scope.symbol.dataParams.Intervals = scope.config.Intervals;
                        // 刪除可能存在的 Interval 參數
                        if (scope.symbol.dataParams.Interval !== undefined) {
                            delete scope.symbol.dataParams.Interval;
                        }
                    }
                    
                    // 移除對 Segment 的設定，Segment 維持使用者設定的值
                    if (window.console) console.log('[Boxplot onDataUpdate] Intervals set to:', intervals, 
                                                    '(dataParams.Intervals =', (scope.symbol && scope.symbol.dataParams ? scope.symbol.dataParams.Intervals : 'N/A'),
                                                    ', Segment 維持不變:', scope.config.Segment, ')');
                }
            }
        }
        if (window.console) console.log('[Boxplot onDataUpdate] After interval calculation logic setup');

        var chartDiv = document.getElementById('boxplot-container');
        if (!chartDiv || !window.d3) {
            if (window.console) console.log('[Boxplot onDataUpdate] chartDiv or d3 missing, returning.');
            return;
        }
        chartDiv.innerHTML = '';
        if (window.console) console.log('[Boxplot onDataUpdate] After chartDiv clear');
        
        // 安全建立 tooltip div
        var tooltip;
        try {
            tooltip = d3.select(chartDiv)
                .append('div')
                .attr('id', 'boxplot-tooltip')
                .style('position', 'absolute')
                .style('pointer-events', 'none')
                .style('z-index', 10)
                .style('background', 'rgba(30,30,30,0.97)')
                .style('color', '#fff')
                .style('border', '1px solid #888')
                .style('border-radius', '6px')
                .style('padding', '8px 12px')
                .style('font-size', '13px')
                .style('display', 'none');
        } catch (e) {
            // 如果建立 tooltip 失敗，建立一個假的 tooltip 物件以避免程式錯誤
            if (window.console) console.warn('[Boxplot] Failed to create tooltip:', e);
            tooltip = {
                html: function() { return this; },
                style: function() { return this; }
            };
        }
        if (window.console) console.log('[Boxplot onDataUpdate] After tooltip creation');

        try {
            if (window.console) console.log('[Boxplot onDataUpdate] Entering main try block');
            var dataArr = (data && data.Data) ? data.Data : [];
            var n = dataArr.length;
            if (!n) {
                chartDiv.innerHTML = '<div style="color:#fff;text-align:center;padding-top:40px;">無資料</div>';
                if (window.console) console.log('[Boxplot onDataUpdate] No data, returning.');
                return;
            }
            
            if (window.console) console.log('[Boxplot onDataUpdate] After dataArr processing, n =', n);
            // 顯示實際收到的數據樣本數
            var sampleCount = 0;
            if (dataArr && dataArr[0] && dataArr[0].Values) {
                sampleCount = dataArr[0].Values.length;
                if (window.console) console.log('[Boxplot onDataUpdate] 實際收到樣本數:', sampleCount, 
                                               '(設定的 Intervals:', scope.config.Intervals, 
                                               ', dataParams.Intervals:', (scope.symbol && scope.symbol.dataParams ? scope.symbol.dataParams.Intervals : 'N/A'), ')');
            }
            
            // interval segment 功能移除，僅繪製單一 boxplot
            // 只保留原本單一 boxplot 畫法
            // 計算所有 tag 的 boxplot 統計
            var statsList = [];
            var allValues = [];
            for (var i = 0; i < n; ++i) {
                var values = [];
                var vals = (dataArr[i] && dataArr[i].Values) ? dataArr[i].Values : [];
                for (var j = 0; j < vals.length; ++j) {
                    var v = (typeof vals[j].Value === 'number') ? vals[j].Value : parseFloat(vals[j].Value);
                    if (typeof v === 'number' && isFinite(v)) values.push(v);
                }
                values.sort(function(a,b){return a-b;});                // 檢查 d3.quantile 的輸入數據是否正確
                if (!Array.isArray(values) || values.length === 0) {
                    if (window.console) console.warn('[Boxplot onDataUpdate] Invalid values array for d3.quantile for tag', i, ':', values);
                    statsList.push({values: []}); // Push an empty stats object to maintain index alignment
                    continue;
                }
                
                // 檢查數據樣本是否足夠計算分位數（至少需要2個元素）
                if (values.length < 2) {
                    if (window.console) console.warn('[Boxplot onDataUpdate] Not enough data points for d3.quantile for tag', i, ', only', values.length, 'values');
                    // 當只有一個數據點時，設置所有統計值為該值
                    var singleValue = values[0];
                    statsList.push({
                        q1: singleValue,
                        median: singleValue, 
                        q3: singleValue,
                        whiskerMin: singleValue,
                        whiskerMax: singleValue,
                        outliers: [],
                        min: singleValue,
                        max: singleValue,
                        values: values
                    });
                    continue;
                }

                // 確保 d3.quantile 的結果不為 undefined 或 NaN
                var q1;
                try {
                    q1 = d3.quantile(values, 0.25);
                } catch(ex) {
                    if (window.console) console.error('[Boxplot onDataUpdate] Exception when calculating q1:', ex);
                    q1 = null;
                }
                if (q1 === undefined || isNaN(q1)) {
                    if (window.console) console.warn('[Boxplot onDataUpdate] d3.quantile returned undefined or NaN for q1 for tag', i, ':', q1, 'values:', values);
                    q1 = null;
                }                var median;
                try {
                    median = d3.quantile(values, 0.5);
                    if (median === undefined || isNaN(median)) {
                        if (window.console) console.warn('[Boxplot onDataUpdate] d3.quantile returned undefined or NaN for median for tag', i, ':', median, 'values:', values);
                        median = null;
                    }
                } catch(ex) {
                    if (window.console) console.error('[Boxplot onDataUpdate] Exception when calculating median:', ex);
                    median = null;
                }                var q3;
                try {
                    q3 = d3.quantile(values, 0.75);
                    if (q3 === undefined || isNaN(q3)) {
                        if (window.console) console.warn('[Boxplot onDataUpdate] d3.quantile returned undefined or NaN for q3 for tag', i, ':', q3, 'values:', values);
                        q3 = null;
                    }
                } catch(ex) {
                    if (window.console) console.error('[Boxplot onDataUpdate] Exception when calculating q3:', ex);
                    q3 = null;
                }

                var iqr = (q3 !== null && q1 !== null) ? (q3 - q1) : null;
                var min = values[0];
                var max = values[values.length-1];
                
                // 確保 lowerFence/upperFence 計算結果是有限數字
                var lowerFence = (q1 !== null && iqr !== null && isFinite(q1) && isFinite(iqr)) ? q1 - 1.5*iqr : min;
                var upperFence = (q3 !== null && iqr !== null && isFinite(q3) && isFinite(iqr)) ? q3 + 1.5*iqr : max;

                var whiskerMin = min;
                for (var k = 0; k < values.length; ++k) {
                    if (values[k] >= lowerFence) { whiskerMin = values[k]; break; }
                }
                var whiskerMax = max;
                for (var k = values.length-1; k >= 0; --k) {
                    if (values[k] <= upperFence) { whiskerMax = values[k]; break; }
                }
                var outliers = [];
                for (var k = 0; k < values.length; ++k) {
                    if (values[k] < lowerFence || values[k] > upperFence) outliers.push(values[k]);
                }
                
                // 確保統計值是有限數字，否則設為 null
                statsList.push({
                    q1: isFinite(q1) ? q1 : null,
                    median: isFinite(median) ? median : null,
                    q3: isFinite(q3) ? q3 : null,
                    whiskerMin: isFinite(whiskerMin) ? whiskerMin : null,
                    whiskerMax: isFinite(whiskerMax) ? whiskerMax : null,
                    outliers: outliers.filter(isFinite), // 過濾掉非有限的離群值
                    min: isFinite(min) ? min : null,
                    max: isFinite(max) ? max : null,
                    values: values // 原始有效數值
                });
                
                // 只將有效的 whiskerMin, whiskerMax 和 outliers 加入 allValues
                if (isFinite(whiskerMin)) allValues.push(whiskerMin);
                if (isFinite(whiskerMax)) allValues.push(whiskerMax);
                for (var k = 0; k < outliers.length; ++k) {
                    if (isFinite(outliers[k])) allValues.push(outliers[k]);
                }
            }
            if (window.console) console.log('[Boxplot onDataUpdate] After stats calculation, statsList length:', statsList.length, 'allValues length:', allValues.length);
            
            if (!allValues.length) {
                chartDiv.innerHTML = '<div style="color:#fff;text-align:center;padding-top:40px;">無資料可供繪製(allValues empty)</div>';
                if (window.console) console.log('[Boxplot onDataUpdate] allValues is empty after stats calculation, returning.');
                return;
            }
            
            var yMin = Math.min.apply(null, allValues);
            var yMax = Math.max.apply(null, allValues);                // !!! 新增檢查: 確保 yMin 和 yMax 是有效的有限數字 !!!
                if (!isFinite(yMin) || !isFinite(yMax) || yMin === undefined || yMax === undefined || yMin === null || yMax === null) {
                     chartDiv.innerHTML = '<div style="color:#fff;text-align:center;padding-top:40px;">無法建立有效的 Y 軸範圍 (Min/Max 無效)</div>';
                     if (window.console) console.error('[Boxplot onDataUpdate] Calculated yMin or yMax is not valid: yMin=', yMin, 'yMax=', yMax, 'allValues:', allValues);
                     return; // 提前返回，不進行繪製
                }
                
                // !!! 新增檢查: 確保 yMin != yMax，否則 scale 會有問題 !!!
                if (yMin === yMax) {
                    if (window.console) console.warn('[Boxplot onDataUpdate] yMin equals yMax (', yMin, '), adjusting range');
                    // 添加小幅度，避免 scale 範圍為零
                    yMin = yMin - Math.abs(yMin * 0.1 || 1);
                    yMax = yMax + Math.abs(yMax * 0.1 || 1);
                }

            if (window.console) console.log('[Boxplot onDataUpdate] After yMin/yMax calculation: yMin=', yMin, 'yMax=', yMax);

            // 畫圖
            var width = Math.max(300, n * 120), height = 260;
            var margin = {top: 30, right: 30, bottom: 60, left: 60};
            var plotW = width - margin.left - margin.right;
            var plotH = height - margin.top - margin.bottom;
            var xScale = d3.scaleBand().domain(d3.range(n)).range([0, plotW]).padding(0.3);
            var yScale = d3.scaleLinear().domain([yMin, yMax]).nice().range([margin.top+plotH, margin.top]);
            var svg = d3.select(chartDiv)
                .append('svg')
                .attr('width', width)
                .attr('height', height)
                .style('background', '#222');
            if (window.console) console.log('[Boxplot onDataUpdate] After SVG and scales setup');
            
            // y 軸
            var yAxis = d3.axisLeft(yScale).ticks(6);
            svg.append('g')
                .attr('transform', 'translate(' + margin.left + ',0)')
                .call(yAxis)
                .selectAll('text').attr('fill', '#fff');
            // x 軸
            var xAxis = d3.axisBottom(xScale).tickFormat(function(d,i){
                var label = (dataArr[i] && (dataArr[i].Label || dataArr[i].Name || dataArr[i].Path || dataArr[i].WebId || 'Tag'+i));
                return (label && label.length > 18) ? label.slice(0,15)+'...' : label;
            });
            svg.append('g')
                .attr('transform', 'translate(' + margin.left + ',' + (margin.top+plotH) + ')')
                .call(xAxis)
                .selectAll('text')
                .attr('fill', '#fff')
                .attr('y', 12)
                .attr('x', 0)
                .attr('dy', '.71em')
                .attr('transform', null)
                .style('text-anchor', 'middle');
            if (window.console) console.log('[Boxplot onDataUpdate] After axes drawing');            // 繪製每個 tag 的 boxplot
            for (var i = 0; i < n; ++i) {
                // !!! 新增檢查: 確保 statsList[i] 存在且有效統計值存在 !!!
                var stat = statsList[i];
                if (!stat) {
                    if (window.console) console.warn('[Boxplot onDataUpdate] Skipping drawing for tag', i, 'due to missing stat object');
                    continue;
                }
                
                if (!stat.values || stat.values.length === 0) {
                    if (window.console) console.warn('[Boxplot onDataUpdate] Skipping drawing for tag', i, 'due to empty values array');
                    continue;
                }
                
                // 特別處理單點數據情況
                if (stat.values.length === 1) {
                    // 已經在前面處理過，可以直接使用 stat 中的值
                    if (window.console) console.log('[Boxplot onDataUpdate] Drawing single-value boxplot for tag', i);
                } 
                // 檢查必要的統計值
                else if (stat.q1 === null || stat.median === null || stat.q3 === null || stat.whiskerMin === null || stat.whiskerMax === null) {
                    if (window.console) console.warn('[Boxplot onDataUpdate] Skipping drawing for tag', i, 'due to invalid stats:', stat);
                    continue;
                }

                if (window.console) console.log('[Boxplot onDataUpdate] Start loop for tag', i);
                
                var x = xScale(i) + xScale.bandwidth()/2 + margin.left;
                var boxW = Math.max(18, xScale.bandwidth()*0.7);
                // box
                var boxRect = svg.append('rect')
                    .attr('x', x - boxW/2)
                    .attr('y', yScale(stat.q3))
                    .attr('width', boxW)
                    .attr('height', yScale(stat.q1) - yScale(stat.q3))
                    .attr('fill', '#3e98d3')
                    .attr('stroke', '#226088')
                    .attr('stroke-width', 2);
                // median
                svg.append('line')
                    .attr('x1', x - boxW/2)
                    .attr('x2', x + boxW/2)
                    .attr('y1', yScale(stat.median))
                    .attr('y2', yScale(stat.median))
                    .attr('stroke', '#226088')
                    .attr('stroke-width', 2);
                // whiskers
                var whisker1 = svg.append('line')
                    .attr('x1', x)
                    .attr('x2', x)
                    .attr('y1', yScale(stat.whiskerMin))
                    .attr('y2', yScale(stat.q1))
                    .attr('stroke', '#226088')
                    .attr('stroke-width', 2);
                var whisker2 = svg.append('line')
                    .attr('x1', x)
                    .attr('x2', x)
                    .attr('y1', yScale(stat.q3))
                    .attr('y2', yScale(stat.whiskerMax))
                    .attr('stroke', '#226088')
                    .attr('stroke-width', 2);
                // whisker caps
                svg.append('line')
                    .attr('x1', x - boxW*0.2)
                    .attr('x2', x + boxW*0.2)
                    .attr('y1', yScale(stat.whiskerMin))
                    .attr('y2', yScale(stat.whiskerMin))
                    .attr('stroke', '#226088')
                    .attr('stroke-width', 2);
                svg.append('line')
                    .attr('x1', x - boxW*0.2)
                    .attr('x2', x + boxW*0.2)
                    .attr('y1', yScale(stat.whiskerMax))
                    .attr('y2', yScale(stat.whiskerMax))
                    .attr('stroke', '#226088')
                    .attr('stroke-width', 2);
                // outliers
                for (var k = 0; k < stat.outliers.length; ++k) {
                    // 確保離群值是有限數字
                    if (!isFinite(stat.outliers[k])) continue;

                    var outlierCircle = svg.append('circle')
                        .attr('cx', x)
                        .attr('cy', yScale(stat.outliers[k]))
                        .attr('r', 4)
                        .attr('fill', '#226088')
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 1.2);
                    (function(i, outlierCircle) {
                        try {
                            outlierCircle.on('mouseover', function() {
                                var html = '<b>' + (dataArr[i].Label || dataArr[i].Name || 'Tag'+i) + '</b><br>' +
                                    '樣本數: ' + statsList[i].values.length + '<br>' +
                                    'Min: ' + statsList[i].min + '<br>' +
                                    'Q1: ' + statsList[i].q1 + '<br>' +
                                    'Median: ' + statsList[i].median + '<br>' +
                                    'Q3: ' + statsList[i].q3 + '<br>' +
                                    'Max: ' + statsList[i].max;
                                tooltip.html(html)
                                    .style('display', 'block');
                            })
                            .on('mousemove', function(event) {
                                try {
                                    // 確保事件物件存在
                                    if (!event && window.console) {
                                        console.warn('[Boxplot mousemove] Event argument is undefined or null. Falling back to window.event if available.');
                                        event = window.event || {}; // 提供空物件作為後備
                                    }

                                    if (window.console) {
                                        console.log('[Boxplot mousemove] Event object being used:', event);
                                        if (event) {
                                            console.log('[Boxplot mousemove] event.clientX:', event.clientX, 'event.clientY:', event.clientY);
                                        } else {
                                            console.error('[Boxplot mousemove] CRITICAL: Event object is still undefined or null after fallback!');
                                            return; 
                                        }
                                    }
                                    
                                    if (typeof d3.pointer !== 'function' && window.console) {
                                        console.error("[Boxplot mousemove] d3.pointer is not defined even after polyfill attempt!");
                                        return;
                                    }

                                    var mouse = d3.pointer(event, document.body);
                                    // 確保 mouse 陣列存在且有值
                                    if (!mouse || !Array.isArray(mouse) || mouse.length < 2) {
                                        if (window.console) console.error('[Boxplot mousemove] d3.pointer returned invalid result:', mouse);
                                        return;
                                    }
                                    var x = mouse[0];
                                    var y = mouse[1];
                                    tooltip.style('left', (x + 10) + 'px')
                                           .style('top', (y - 30) + 'px');
                                } catch (ex) {
                                    if (window.console) {
                                        console.error('[Boxplot] mousemove event error:', ex);
                                        console.error('Stack trace:', ex.stack);
                                        console.error('Event object at time of error:', event);
                                    }
                                }
                            })
                            .on('mouseout', function() {
                                tooltip.style('display', 'none');
                            });
                        } catch(ex) {}
                    })(i, outlierCircle);
                }
                // box tooltip
                (function(i, boxRect) {
                    try {
                        boxRect.on('mouseover', function() {
                            var html = '<b>' + (dataArr[i].Label || dataArr[i].Name || 'Tag'+i) + '</b><br>' +
                                '樣本數: ' + statsList[i].values.length + '<br>' +
                                'Min: ' + statsList[i].min + '<br>' +
                                'Q1: ' + statsList[i].q1 + '<br>' +
                                'Median: ' + statsList[i].median + '<br>' +
                                'Q3: ' + statsList[i].q3 + '<br>' +
                                'Max: ' + statsList[i].max;
                            tooltip.html(html)
                                .style('display', 'block');
                        })
                        .on('mousemove', function(event) {
                            try {
                                // 確保事件物件存在
                                if (!event && window.console) {
                                    console.warn('[Boxplot mousemove] Event argument is undefined or null. Falling back to window.event if available.');
                                    event = window.event || {}; // 提供空物件作為後備
                                }

                                if (window.console) {
                                    console.log('[Boxplot mousemove] Event object being used:', event);
                                    if (event) {
                                        console.log('[Boxplot mousemove] event.clientX:', event.clientX, 'event.clientY:', event.clientY);
                                    } else {
                                        console.error('[Boxplot mousemove] CRITICAL: Event object is still undefined or null after fallback!');
                                            return; 
                                    }
                                }
                                
                                if (typeof d3.pointer !== 'function' && window.console) {
                                    console.error("[Boxplot mousemove] d3.pointer is not defined even after polyfill attempt!");
                                    return;
                                }

                                var mouse = d3.pointer(event, document.body);
                                // 確保 mouse 陣列存在且有值
                                if (!mouse || !Array.isArray(mouse) || mouse.length < 2) {
                                    if (window.console) console.error('[Boxplot mousemove] d3.pointer returned invalid result:', mouse);
                                    return;
                                }
                                var x = mouse[0];
                                var y = mouse[1];
                                tooltip.style('left', (x + 10) + 'px')
                                       .style('top', (y - 30) + 'px');
                            } catch (ex) {
                                if (window.console) {
                                    console.error('[Boxplot] mousemove event error:', ex);
                                    console.error('Stack trace:', ex.stack);
                                    console.error('Event object at time of error:', event);
                                }
                            }
                        })
                        .on('mouseout', function() {
                            tooltip.style('display', 'none');
                        });
                    } catch(ex) {}
                })(i, boxRect);
                // whisker tooltip
                (function(i, whisker1, whisker2) {
                    try {
                        var showWhiskerTip = function() {
                            var html = '<b>' + (dataArr[i].Label || dataArr[i].Name || 'Tag'+i) + '</b><br>' +
                                '樣本數: ' + statsList[i].values.length + '<br>' +
                                'Min: ' + statsList[i].min + '<br>' +
                                'Q1: ' + statsList[i].q1 + '<br>' +
                                'Median: ' + statsList[i].median + '<br>' +
                                'Q3: ' + statsList[i].q3 + '<br>' +
                                'Max: ' + statsList[i].max;
                            tooltip.html(html)
                                .style('display', 'block');
                        };
                        whisker1.on('mouseover', showWhiskerTip)
                            .on('mousemove', function(event) {
                                try {
                                    // 確保事件物件存在
                                    if (!event && window.console) {
                                        console.warn('[Boxplot mousemove] Event argument is undefined or null. Falling back to window.event if available.');
                                        event = window.event || {}; // 提供空物件作為後備
                                    }

                                    if (window.console) {
                                        console.log('[Boxplot mousemove] Event object being used:', event);
                                        if (event) {
                                            console.log('[Boxplot mousemove] event.clientX:', event.clientX, 'event.clientY:', event.clientY);
                                        } else {
                                            console.error('[Boxplot mousemove] CRITICAL: Event object is still undefined or null after fallback!');
                                            return; 
                                        }
                                    }
                                    
                                    if (typeof d3.pointer !== 'function' && window.console) {
                                        console.error("[Boxplot mousemove] d3.pointer is not defined even after polyfill attempt!");
                                        return;
                                    }

                                    var mouse = d3.pointer(event, document.body);
                                    // 確保 mouse 陣列存在且有值
                                    if (!mouse || !Array.isArray(mouse) || mouse.length < 2) {
                                        if (window.console) console.error('[Boxplot mousemove] d3.pointer returned invalid result:', mouse);
                                        return;
                                    }
                                    var x = mouse[0];
                                    var y = mouse[1];
                                    tooltip.style('left', (x + 10) + 'px')
                                           .style('top', (y - 30) + 'px');
                                } catch (ex) {
                                    if (window.console) {
                                        console.error('[Boxplot] mousemove event error:', ex);
                                        console.error('Stack trace:', ex.stack);
                                        console.error('Event object at time of error:', event);
                                    }
                                }
                            })
                            .on('mouseout', function() { tooltip.style('display', 'none'); });
                        whisker2.on('mouseover', showWhiskerTip)
                            .on('mousemove', function(event) {
                                try {
                                    // 確保事件物件存在
                                    if (!event && window.console) {
                                        console.warn('[Boxplot mousemove] Event argument is undefined or null. Falling back to window.event if available.');
                                        event = window.event || {}; // 提供空物件作為後備
                                    }

                                    if (window.console) {
                                        console.log('[Boxplot mousemove] Event object being used:', event);
                                        if (event) {
                                            console.log('[Boxplot mousemove] event.clientX:', event.clientX, 'event.clientY:', event.clientY);
                                        } else {
                                            console.error('[Boxplot mousemove] CRITICAL: Event object is still undefined or null after fallback!');
                                            return; 
                                        }
                                    }
                                    
                                    if (typeof d3.pointer !== 'function' && window.console) {
                                        console.error("[Boxplot mousemove] d3.pointer is not defined even after polyfill attempt!");
                                        return;
                                    }

                                    var mouse = d3.pointer(event, document.body);
                                    // 確保 mouse 陣列存在且有值
                                    if (!mouse || !Array.isArray(mouse) || mouse.length < 2) {
                                        if (window.console) console.error('[Boxplot mousemove] d3.pointer returned invalid result:', mouse);
                                        return;
                                    }
                                    var x = mouse[0];
                                    var y = mouse[1];
                                    tooltip.style('left', (x + 10) + 'px')
                                           .style('top', (y - 30) + 'px');
                                } catch (ex) {
                                    if (window.console) {
                                        console.error('[Boxplot] mousemove event error:', ex);
                                        console.error('Stack trace:', ex.stack);
                                        console.error('Event object at time of error:', event);
                                    }
                                }
                            })
                            .on('mouseout', function() { tooltip.style('display', 'none'); });
                    } catch(ex) {}
                })(i, whisker1, whisker2);
                if (window.console) console.log('[Boxplot onDataUpdate] End loop for tag', i);
            }
            if (window.console) console.log('[Boxplot onDataUpdate] After drawing loop');

        } catch (e) {
            if (window.console) console.error('[Boxplot] onDataUpdate error:', e, e.stack);
        }
        // onDataUpdate 結尾主動呼叫 recalcIntervals，確保資料到時能正確計算 Intervals
        if (scope && typeof scope.recalcIntervals === 'function') {
            // 確保刪除舊的 Interval 參數，避免與 Segment 混淆
            if (scope.config && scope.config.Interval !== undefined) {
                if (window.console) console.log('[Boxplot onDataUpdate] 刪除舊的 Interval 參數');
                delete scope.config.Interval;
            }
            
            scope.lastData = data;
            scope.recalcIntervals();
        }
    };

    CS.symbolCatalog.register(symbolDefinition);
})(window.PIVisualization);
