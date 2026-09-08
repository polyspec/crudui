//var console = { log: function() {} };

function consolelog() {
    //console.log(arguments);
}

// $(function () {
//     $.fn.regex = function (pattern, fn, fn_a) {
//         var fn = fn || $.fn.text;
//         return this.filter(function () {
//             return pattern.test(fn.apply($(this), fn_a));
//         });
//     };
// });
$.extend($.fn, {
    // https://jqueryvalidation.org/validate/
    validate: function (options) {
        // If nothing is selected, return nothing; can't chain anyway
        if (!this.length) {
            if (options && options.debug && window.console) {
                console.warn("Nothing selected, can't validate, returning nothing.");
            }
            return;
        }

        // Check if a validator for this form was already created
        var validator = $.data(this[0], "validator");
        if (validator) {
            return validator;
        }

        // Add novalidate tag if HTML5.
        this.attr("novalidate", "novalidate");

        validator = new $.validator(options, this[0]);
        $.data(this[0], "validator", validator);

        return validator;
    },
});

$.validator = function (options, form) {
    this.settings = $.extend(true, {}, $.validator.defaults, options);
    this.currentForm = form;
    this.init();
};

// https://jqueryvalidation.org/jQuery.validator.format/
$.validator.format = function (source, params) {
    if (arguments.length === 1) {
        return function () {
            var args = $.makeArray(arguments);
            args.unshift(source);
            return $.validator.format.apply(this, args);
        };
    }
    if (params === undefined) {
        return source;
    }
    if (arguments.length > 2 && params.constructor !== Array) {
        params = $.makeArray(arguments).slice(1);
    }
    if (params.constructor !== Array) {
        params = [params];
    }
    $.each(params, function (i, n) {
        source = source.replace(new RegExp("\\{" + i + "\\}", "g"), function () {
            return n;
        });
    });
    return source;
};

$.extend($.validator, {
    defaults: {
        onfocusin: function (element, event) {
            //consolelog('focusin', element);
            this.lastActive = element;
            //event.stopImmediatePropagation();
            // this.focused = true;
        },
        onfocusout: function (element, event) {
            // this.focused = false;
            console.log("settings.onfocusout", this);
            //console.log("focusout", element);

            $(element).closest("form").data("validator").checkByElement(element, event);
            //event.stopImmediatePropagation();
        },
        oninput: function (element, event) {
            //console.log("change", element);
            $(element).closest("form").data("validator").checkByElement(element, event);
            //event.stopImmediatePropagation();
        },
        onchange: function (element, event) {
            //console.log("change", element);
            $(element).closest("form").data("validator").checkByElement(element, event);
            //event.stopImmediatePropagation();
        },
        onkeyup: function (element, event) {
            //console.log("keyup", element);
            // Avoid revalidate the field when pressing one of the following keys
            // Shift       => 16
            // Ctrl        => 17
            // Alt         => 18
            // Caps lock   => 20
            // End         => 35
            // Home        => 36
            // Left arrow  => 37
            // Up arrow    => 38
            // Right arrow => 39
            // Down arrow  => 40
            // Insert      => 45
            // Num lock    => 144
            // AltGr key   => 225
            var excludedKeys = [16, 17, 18, 20, 35, 36, 37, 38, 39, 40, 45, 144, 225];

            if (
                (event.which === 9 && this.getValueByElement(element) === "") ||
                $.inArray(event.keyCode, excludedKeys) !== -1
            ) {
                return;
            } else {
                //console.log("key up");
                $(element).closest("form").data("validator").checkByElement(element, event);
                //event.stopImmediatePropagation();
            }
        },
        onclick: function (element, event) {
            //console.log("click", element);
            $(element).closest("form").data("validator").checkByElement(element, event);
            //event.stopImmediatePropagation();
        },
        highlight: function (element, errorClass, validClass) {
            if (element.type === "radio") {
                this.findByName(element.name).addClass(errorClass).removeClass(validClass);
            } else {
                $(element).addClass(errorClass).removeClass(validClass);
            }
        },
        unhighlight: function (element, errorClass, validClass) {
            if (element.type === "radio") {
                this.findByName(element.name).removeClass(errorClass).addClass(validClass);
            } else {
                $(element).removeClass(errorClass).addClass(validClass);
            }
        },
    },
    messages: {
        required: "필수 항목입니다.",
        remote: "Please fix this field.",
        email: "유효하지 않은 E-Mail주소입니다.", //Please enter a valid email address.",
        url: "유효하지 않은 URL입니다.", // "Please enter a valid URL.",
        date: "Please enter a valid date.",
        dateISO: "Please enter a valid date (ISO).",
        number: "Please enter a valid number.",
        digits: "Please enter only digits.",
        equalTo: "Please enter the same value again.",
        maxlength: $.validator.format("Please enter no more than {0} characters."),
        minlength: $.validator.format("Please enter at least {0} characters."),
        rangelength: $.validator.format("Please enter a value between {0} and {1} characters long."),
        range: $.validator.format("Please enter a value between {0} and {1}."),
        max: $.validator.format("Please enter a value less than or equal to {0}."),
        min: $.validator.format("Please enter a value greater than or equal to {0}."),
        step: $.validator.format("Please enter a multiple of {0}."),
        notEqual: "Please enter a different value.",
        password8: "8+ chars: upper, lower, number & special character required.",
    },
    prototype: {
        load: function () { },
        setSpec: function (spec) {
            this.spec = spec;
            this.rules = this.fixSpec(this.spec);
        },
        getSpec: function () {
            return this.spec;
        },
        getRules: function () {
            return this.rules;
        },
        addslashes: function (name) {
            return name.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
        },
        getNameByDot: function (dotName) {
            var parts = dotName.split(".");
            if (1 < parts.length) {
                var first = parts.shift();
                return first + "\\[" + parts.join("\\]\\[") + "\\]";
            }
            return dotName;
        },
        getNameByArray: function (parts) {
            if (1 < parts.length) {
                var first = parts.shift();
                return first + "\\[" + parts.join("\\]\\[") + "\\]";
            }
            return parts[0];
        },
        init: function () {
            this.focused = false;
            this.spec = this.settings.spec;
            // 연결된 element를 validate하기 위함
            this.requiredWaves = {};

            this.data = {};
            this.rules = this.fixSpec(this.spec);
            this.prev_element;

            function delegate(event) {
                // Set form expando on contenteditable
                if (!this.form && this.hasAttribute("contenteditable")) {
                    this.form = $(this).closest("form")[0];
                    this.name = $(this).attr("name");
                }

                var validator = $.data(this.form, "validator"),
                    eventType = "on" + event.type.replace(/^validate/, "");
                if (validator) {
                    var settings = validator.settings;
                    if (settings[eventType]) {
                        // console.log("eventType", eventType);
                        //console.log(validator.settings, eventType);
                        // && !$( this ).is( settings.ignore ) ) {
                        settings[eventType].call(validator, this, event);
                    }
                }
                //this.prev_element = this;
                //event.stopImmediatePropagation();
            }

            // var selector =
            //     ":text, [type='hidden'], [type='password'], [type='file'], select, textarea, [type='number'], [type='search'], " +
            //     "[type='tel'], [type='url'], [type='email'], [type='datetime'], [type='date'], [type='month'], " +
            //     "[type='week'], [type='time'], [type='datetime-local'], [type='range'], [type='color'], " +
            //     "[type='radio'], [type='checkbox'], [contenteditable], [type='button']";

            // var selector2 = "select, option, [type='radio'], [type='checkbox']";

            // $(this.currentForm)
            //     .on("focusin.validate", selector, delegate)
            //     .on("focusout.validate", selector, delegate)
            //     .on("keyup.validate", selector, delegate)
            //     .on("change.validate", selector, delegate)
            //     // Support: Chrome, oldIE
            //     // "select" is provided as event.target when clicking a option
            //     .on("click", selector2, delegate);

            var selector = ".valid-target";

            $(this.currentForm)
                .on("focusin.validate", selector, delegate)
                .on("focusout.validate", selector, delegate)
                .on("keyup.validate", selector, delegate)
                .on("change.validate", selector, delegate)
                .on(
                    "click",
                    "select.valid-target, option.valid-target, [type='radio'].valid-target, [type='checkbox'].valid-target",
                    delegate
                );
        },
        getValueByElement: function (element) {
            var $element = $(element);

            if (!$element[0]) {
                console.log(element);
            }

            var type = $element[0].type,
                name = $element[0].name,
                isContentEditable =
                    typeof $element.attr("contenteditable") !== "undefined" &&
                    $element.attr("contenteditable") !== "false",
                val,
                idx;
            consolelog(element);

            if (type === "radio" || type === "checkbox") {
                //return this.findByName(name).filter(":checked").val();
                // console.log(
                //     name,

                //     $('[name="' + name + '"]:checked', this.currentForm).val(),
                //     $('[name="' + name + '"]:checked', this.currentForm).length
                // );

                if ($('[name="' + name + '"]:checked', this.currentForm).length) {
                    return $('[name="' + name + '"]:checked', this.currentForm).val();
                } else {
                    return 0;
                }
            } else if (type === "number" && typeof element.validity !== "undefined") {
                return element.validity.badInput ? "NaN" : $element.val();
            } else if (type === "select-one") {
                consolelog($('[name="' + name + '"] option:selected', this.currentForm).val());
                return $('[name="' + name + '"] option:selected', this.currentForm).val();
            }
            //consolelog(type);

            if (isContentEditable) {
                val = $element.text();
            } else {
                val = $element.val();
            }

            if (type === "file") {
                // Modern browser (chrome & safari)
                if (val.substr(0, 12) === "C:\\fakepath\\") {
                    return val.substr(12);
                }

                // Legacy browsers
                // Unix-based path
                idx = val.lastIndexOf("/");
                if (idx >= 0) {
                    return val.substr(idx + 1);
                }

                // Windows-based path
                idx = val.lastIndexOf("\\");
                if (idx >= 0) {
                    return val.substr(idx + 1);
                }

                // Just the file name
                return val;
            }

            if (typeof val === "string") {
                return val.replace(/\r/g, "");
            }
            return val;
        },
        // 애니메이션 방식으로 유효성 검사
        loadvalidWithAnimation: function () {
            const self = this;

            return new Promise((resolve) => {
                // 모든 검증 대상 요소 수집
                const elements = $(".valid-target", $(this.currentForm)).toArray();
                const totalItems = elements.length;
                let currentIndex = 0;

                // 진행 상황 표시 UI
                let statusDiv = document.getElementById("loading-skeleton-text");
                if (statusDiv) {
                    statusDiv.innerHTML = `유효성 검사 준비 중...`;
                }
                this.focused = false;

                // 청크 단위 처리 함수
                function processChunk() {
                    // 현재 진행 상황 표시
                    // statusDiv.innerHTML = `유효성 검사 중...<br /><div class="fs-9 d-flex justify-content-center text-light">${currentIndex}/${totalItems}</div>`;
                    const progressPercent = Math.floor((currentIndex / totalItems) * 100);

                    // 현재 진행 상황 표시

                    if (statusDiv) {
                        statusDiv.innerHTML = `유효성 검사 중...<br /><div class="fs-9 d-flex justify-content-center text-light">${progressPercent}%</div>`;
                    }

                    // console.log(statusDiv.innerHTML);

                    // 청크 크기 설정 (1개씩 처리)
                    const chunkSize = 30;
                    const endIndex = Math.min(currentIndex + chunkSize, totalItems);

                    // 현재 청크의 요소들 처리
                    for (let i = currentIndex; i < endIndex; i++) {
                        const element = elements[i];
                        const name = element.name;
                        const ruleName = $(element).data("rule-name");

                        if (name && ruleName) {
                            const isValid = self.check(name, self.rules[ruleName], $(element).val(), null, true);

                            // 유효하지 않은 항목 발견 시 즉시 중단
                            if (!isValid) {
                                // statusDiv.innerHTML = `유효하지 않은 항목 발견 (${i + 1}/${totalItems})`;
                                // console.log(statusDiv.innerHTML);
                                // false 결과 반환하고 종료
                                resolve({ isValid: false, element: element });
                                return;
                            }
                        }
                    }

                    // 다음 인덱스로 이동
                    currentIndex = endIndex;

                    // 아직 처리할 항목이 남아있으면 다음 애니메이션 프레임에서 다음 청크 처리
                    if (currentIndex < totalItems) {
                        requestAnimationFrame(processChunk);
                    } else {
                        // 모든 처리 완료 - 모두 유효함
                        if (statusDiv) {
                            statusDiv.innerHTML = `유효성 검사 완료: 모두 유효함`;
                            // console.log(statusDiv.innerHTML);
                        }
                        resolve({ isValid: true, element: null });
                    }
                }

                // 첫 청크 처리 시작
                requestAnimationFrame(processChunk);
            });
        },
        loadvalid: function (focused = false) {
            //console.log("loadvalid");
            this.focused = focused;
            var is_log = false;
            var formData = [];
            $(".valid-target", $(this.currentForm)).each(function (index) {
                var self = $(this);
                var name = {};
                name["name"] = this.name;
                name["rule-name"] = self.data("rule-name");
                if (-1 < this.name.indexOf("[]")) {
                    name["value"] ??= [];
                    name["value"].push(this.value); // = this.value;
                } else {
                    name["value"] = this.value;
                }

                formData.push(name);
            });

            // console.log(formData);

            var result = true;
            if (is_log) {
                const start = performance.now();
                console.log("검사 시작:", start.toFixed(2), "ms");
            }
            const progressDiv = document.getElementById("progress-bar");

            var total = formData.length;
            var print = false;
            // if (document.getElementById("loading-skeleton-text").innerHTML == "폼 검사 중") {
            //     print = 1;
            // }
            for (var i in formData) {
                const item = formData[i];
                if (is_log) {
                    const itemStart = performance.now();
                }
                // if (print) {
                //     // window.requestAnimationFrame(function () {
                //     var tmp = document.getElementById("loading-skeleton-text");
                //     //tmp.style.height = i + "px";
                //     // ajaxLoading(this.currentForm, `폼 검사 중 (${i}/${total})`);
                //     tmp.innerHTML = `폼 검사 중 (${i}/${total})`;
                //     //const rect = tmp.getBoundingClientRect();

                //     //console.log(rect);
                //     console.log("폼 검사 중 (" + i + ")");
                //     //console.log(tmp.offsetWidth);
                //     // });
                // }

                // if (i % 100 === 0) {
                //     progressDiv.innerHTML = `<div>유효성 검사 중... ${i}/${total}</div>`;
                //     console.log(progressDiv.offsetHeight);
                //     void progressDiv.offsetHeight; // 강제 리플로우
                // }
                const isValid = this.check(item["name"], this.rules[item["rule-name"]], item["value"]);

                if (is_log) {
                    const itemEnd = performance.now();
                    console.log(`→ 검사 완료 (${(itemEnd - itemStart).toFixed(2)}ms)`);
                }
                if (!isValid) {
                    result = false;
                }
            }
            if (is_log) {
                const end = performance.now();
                console.log("검사 종료:", end.toFixed(2), "ms");
                console.log("총 소요 시간:", (end - start).toFixed(2), "ms");
            }
            // console.log("result", result);
            //console.log(formData);
            return result;
        },
        checkByElement: function (element, waveElement) {
            var $element = $(element, this.currentForm);
            var name = $element.attr("name");
            var data = $element.val();
            var ruleName = $element.data("rule-name");

            if (name == undefined || !name) {
                return false;
            }

            if (ruleName == undefined || !ruleName) {
                return false;
            }

            return this.check(name, this.rules[ruleName], data, waveElement);
        },
        checkByElements: function () {
            // console.trace("함수 호출 추적");
            this.focused = true;

            // console.log("rules", this.rules);
            var element = [];

            for (var i = 0; i < arguments.length; i++) {
                if (arguments[i] !== undefined) {
                    element = [...element, ...arguments[i]];
                }
            }

            if (element.length > 0) {
                var formData = [];
                for (var i = 0; i < element.length; i++) {
                    var self = $(element[i]);
                    var name = {};
                    name["name"] = element[i].name;
                    name["rule-name"] = self.data("rule-name");
                    if (-1 < element[i].name.indexOf("[]")) {
                        name["value"] ??= [];
                        name["value"].push(element[i].value); // = this.value;
                    } else {
                        name["value"] = element[i].value;
                    }

                    formData.push(name);
                }
                //console.log(formData);
                var result = true;
                for (var i in formData) {
                    if (
                        false ===
                        this.check(formData[i]["name"], this.rules[formData[i]["rule-name"]], formData[i]["value"])
                    ) {
                        result = false;
                    }
                }

                return result;
            } else {
                //console.log(element);
                //this.check(element.name, this.rules[$(element).data("rule-name")]);
                throw new Error("element not found");
            }
            return null;
        },
        check: function (elementName, spec, data, waveElementName, is_submit = false) {
            var is_log = false;
            if (is_log) {
                var totalStart = performance.now(); // 전체 시작 시간
            }

            if (typeof spec === "undefined") {
                spec = {
                    rules: {},
                    messages: {},
                };
            }

            var escapeName = elementName.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
            var $element = $('[name="' + escapeName + '"]', this.currentForm);
            var element = $element[0];

            var messageId = elementName.replace(/\[\]$/, "").replace(/\[/g, "_").replace(/\]/g, "").replace(/=/g, "_").replace(/&/g, "_");
            //  console.log("escapeName", escapeName);
            if (element.classList.contains("form-control-file")) {
                messageId = messageId.replace(/_name$/, "");
            }

            var isError = false;
            var parent = $element.closest(".input-group-wrapper");
            parent.find(".message_" + messageId).remove();

            var messages = spec.messages;
            var rule;

            if (is_log) {
                console.log("elementName", elementName);
                console.log("spec", spec);
            }
            for (let method in spec.rules) {
                if (is_log) {
                    console.log("    ", method);
                }
                rule = { method: method, parameters: spec.rules[method] };

                if (is_log) {
                    var methodStart = performance.now(); // 각 메서드 시작 시간
                }
                try {
                    var result = $.validator.methods[method].call(
                        this,
                        this.getValueByElement(element),
                        element,
                        rule.parameters,
                        spec.rules["required"] ?? null
                    );

                    if (is_log) {
                        const methodEnd = performance.now(); // 각 메서드 종료 시간
                        console.log(spec);
                        console.log(
                            `[검사 시간] ${method} (${elementName}): ${(methodEnd - methodStart).toFixed(2)}ms`
                        );
                    }
                    if (result === "dependency-mismatch") {
                        continue;
                    }

                    if (!result) {
                        var message = this.findDefined(
                            this.customMessage(messages, rule),
                            this.defaultMessage(element, rule)
                        );

                        if (0 == parent.find(".message_" + messageId).length) {
                            var errorHtml =
                                '<div class="message message_' +
                                messageId +
                                '" style="color:red">' +
                                message +
                                "</div>";
                            parent.closest(".input-group-wrapper").append(errorHtml);
                        }

                        isError = true;
                    }
                } catch (e) {
                    throw e;
                }
            }

            if (typeof this.requiredWaves[escapeName] !== "undefined") {
                for (let i in this.requiredWaves[escapeName]) {
                    if (waveElementName != this.requiredWaves[escapeName][i]) {
                        this.checkByElement('[name="' + this.requiredWaves[escapeName][i] + '"]', elementName);
                    }
                }
            }

            if (is_log) {
                const totalEnd = performance.now(); // 전체 종료 시간
                console.log(`[총 실행 시간] ${elementName}: ${(totalEnd - totalStart).toFixed(2)}ms`);
            }
            if (true == isError) {
                consolelog("error", elementName);
                return false;
            }

            return true;
        },
        optional: function (element) {
            var val = this.getValueByElement(element);
            return !$.validator.methods.required.call(this, val, element) && "dependency-mismatch";
        },
        checkable: function (element) {
            //consolelog(element);
            if (element && undefined !== typeof element.type) {
                return /radio|checkbox/i.test(element.type);
            } else {
                //alert(element);
            }
        },
        findByName: function (name) {
            return $('[name="' + name + '"]', this.currentForm);
            //return $( document.getElementsByName(name), this.currentFrom );
        },
        getLength: function (value, element) {
            switch (element.nodeName.toLowerCase()) {
                case "select":
                    return $("option:selected", element).length;
                case "input":
                    if (this.checkable(element)) {
                        return this.findByName(element.name).filter(":checked").length;
                    }
            }
            return value.length;
        },
        // 시간 문자열을 자동으로 감지하여 적절한 단위로 변환하는 통합 헬퍼 함수
        convertTime: function (timeStr) {
            if (!timeStr) return 0;

            const parts = timeStr.split(":");
            const hours = parseInt(parts[0] || 0, 10);
            const minutes = parseInt(parts[1] || 0, 10);
            const seconds = parseInt(parts[2] || 0, 10);

            // 초 단위 값이 있는 경우 초 단위로 반환
            if (parts.length > 2 && !isNaN(seconds)) {
                return hours * 3600 + minutes * 60 + seconds;
            }

            // 그 외의 경우 분 단위로 반환
            return hours * 60 + minutes;
        },
        depend: function (param, element) {
            consolelog("typeof param", typeof param, param, element);
            return this.dependTypes[typeof param] ? this.dependTypes[typeof param].call(this, param, element) : true;
        },
        checkCondition: function (condition, element) {
            // 조건문 내의 변수를 data 객체의 값으로 대체
            var self = this;
            let interpolatedCondition = condition.replace(/\{([^}]+)\}/g, function (match, path) {
                // console.log(path, match, element.name, path.replace(/\[/g, ".").replace(/\]/g, "*"));
                let newRightName = self.getPath2(path.replace(/\[/g, ".").replace(/\]/g, "*"), element.name);

                var newRightSelector = '[name="' + newRightName + '"]';
                var newRightElement = $(newRightSelector, element.form);
                var value;

                //console.log(newRightSelector);
                if (newRightElement.length) {
                    value = self.getValueByElement(newRightElement); //newRightElement.val();
                } else {
                    throw new Error(params + " depend error");
                }
                //console.log(newRightName, value);
                //console.log(newRightName, value);
                return typeof value === "string" ? `'${value}'` : value;
            });
            // console.log(element.name, interpolatedCondition, eval(interpolatedCondition));
            // 조건문 평가
            return eval(interpolatedCondition);
        },
        getPath2: function (Name, elementName) {
            var newName = Name;
            if (-1 < Name.indexOf(".")) {
                var dotName = elementName.replace(/\[/g, ".").replace(/\]/g, "");
                var dots = dotName.split(".");
                var targets = Name.split(".");

                var news = [];
                for (i in targets) {
                    var target = targets[i];
                    if (target == "*") {
                        target = dots[i];
                    }
                    news.push(target);
                }
                newName = this.getNameByArray(news);
            } else {
                newName = Name;
            }
            return newName;
        },
        getPath: function (Name, elementName) {
            var newName = Name;

            // Name 앞에 연속된 '.'의 개수를 구한다.
            var dotMatch = Name.match(/^(\.+)/);
            if (dotMatch) {
                var dotCount = dotMatch[1].length; // 맨 앞에 연속된 '.'의 개수
                var cleanedElementName = elementName;

                // dotCount 개수만큼 elementName 끝의 [something] 패턴을 제거한다.
                // 여기서 [^\[]+는 인덱스 문자열을 의미.
                for (var i = 0; i < dotCount; i++) {
                    cleanedElementName = cleanedElementName.replace(/\[[^\[]+\]$/g, "");
                }

                // Name에서 leading dots를 제거하고 남은 부분 가져오기
                var remainingName = Name.slice(dotCount);

                // 새로운 이름 구성
                newName = cleanedElementName + "[" + remainingName + "]";
            } else if (Name.indexOf(".") > -1) {
                // 점이 중간에 있는 경우 처리
                var dotName = elementName.replace(/\[/g, ".").replace(/\]/g, "");
                var dots = dotName.split(".");
                var targets = Name.split(".");

                var news = [];
                for (var i in targets) {
                    var target = targets[i];
                    if (target == "*") {
                        target = dots[i];
                    }
                    news.push(target);
                }
                newName = this.getNameByArray(news);
            } else {
                newName = Name;
            }

            return newName;
        },
        dependTypes: {
            boolean: function (param) {
                return param;
            },
            object: function (param, element) {
                var result = true;
                for (i in param) {
                    consolelog("param[i], element", param[i], element);
                    if (!this.dependTypes["string"].call(this, param[i], element)) {
                        if (result == true) {
                            result = false;
                        }
                    }
                }
                consolelog("a123", param, element);
                return result;
            },
            string: function (params, element) {
                //console.log(element.name);

                //console.log(params, element.name);
                if (params) {
                    if (-1 < params.indexOf("{")) {
                        return this.checkCondition(params, element);
                    } else {
                        var gubun = "";
                        if (-1 < params.indexOf("&&")) {
                            gubun = "&&";
                        } else if (-1 < params.indexOf("||")) {
                            gubun = "||";
                        }

                        var conditions = params.split(/&&|\|\|/).map(function (item) {
                            return item.trim();
                        });

                        // console.log(element, conditions);
                        var results_true = [];
                        var results_false = [];

                        for (var index = 0, total = conditions.length; index < total; index++) {
                            var parts = conditions[index].split(" ");
                            var leftName = parts[0]; // a
                            var newLeftName = "";
                            var newRightName = "";
                            var compareValue = ""; // ==
                            var rightValue = ""; // b
                            if (parts[1]) {
                                compareValue = parts[1];
                            }
                            if (parts[2]) {
                                rightValue = parts[2];
                            }

                            // console.log("element.accept ", element.accept);
                            // console.log("element", element);
                            if (element.classList.contains("form-control-file")) {
                                // text file type일때 ['name]을 삭제
                                newLeftName = this.getPath(leftName, element.name.replace(/\[name\]$/, ""));
                            } else if (element.type == "checkbox" && element.name.endsWith("[]")) {
                                newLeftName = this.getPath(
                                    leftName.replace(/^\./, ""),
                                    element.name.replace(/\[\]$/, "")
                                );
                            } else {
                                newLeftName = this.getPath(leftName, element.name);
                            }
                            var newLeftSelector = '[name="' + newLeftName + '"]';
                            var newLeftElement = $(newLeftSelector, element.form);

                            if (0 == newLeftElement.length) {
                                console.log(element);
                                throw new Error(
                                    element.name + " -> " + leftName + " => " + newLeftName + " target find error"
                                );
                            }

                            if (typeof this.requiredWaves[newLeftName] === "undefined") {
                                this.requiredWaves[newLeftName] = [];
                            }
                            if (-1 === $.inArray(element.name, this.requiredWaves[newLeftName])) {
                                this.requiredWaves[newLeftName].push(element.name);
                            }
                            // console.log(compareValue);
                            if (compareValue) {
                                newRightName = this.getPath(rightValue, element.name);
                                var newRightSelector = '[name="' + newRightName + '"]';
                                var newRightElement = $(newRightSelector, element.form);

                                if (newRightElement.length) {
                                    rightValue = newRightElement.val();
                                } else {
                                    rightValue = parts[2];
                                }
                                var result = false;

                                // console.log(compareValue, newLeftElement, newRightElement);
                                switch (compareValue) {
                                    case "in":
                                        var rightvalues = rightValue.split(",").map(function (item) {
                                            return item.trim();
                                        });

                                        // console.log(rightvalues, this.getValueByElement(newLeftElement));
                                        result = rightvalues.includes(this.getValueByElement(newLeftElement));
                                        break;
                                    case "==":
                                        result = this.getValueByElement(newLeftElement) == rightValue;
                                        break;
                                    case "<=":
                                        result = this.getValueByElement(newLeftElement) <= rightValue;
                                        break;
                                    case "!=":
                                        result = this.getValueByElement(newLeftElement) != rightValue;
                                        break;
                                    case ">=":
                                        result = this.getValueByElement(newLeftElement) >= rightValue;
                                        break;
                                    case ">":
                                        result = this.getValueByElement(newLeftElement) > rightValue;
                                        break;
                                    case "<":
                                        result = this.getValueByElement(newLeftElement) < rightValue;
                                        break;
                                    case "&":
                                        result = this.getValueByElement(newLeftElement) & rightValue;
                                        break;

                                    case "|":
                                        consolelog(
                                            "valaa",
                                            param,
                                            newLeftElement,
                                            this.getValueByElement(newLeftElement)
                                        );
                                        var loop = newLeftElement;
                                        for (var i10 = 0, j10 = loop.length; i10 < j10; i10++) {
                                            consolelog("loop", loop, i10, loop[i10], loop[i10].value);
                                            if (loop[i10].value == rightValue) {
                                                result = true;
                                            }
                                        }
                                        //return false;
                                        break;
                                }
                                // console.log(
                                //     newLeftElement.attr("name"),
                                //     this.getValueByElement(newLeftElement),
                                //     compareValue,
                                //     rightValue,
                                //     result
                                // );

                                if (result === true) {
                                    results_true.push(result);
                                } else {
                                    results_false.push(result);
                                }
                            } else {
                                //console.log(newLeftElement);
                                var result = this.getValueByElement(newLeftElement);
                                if (result) {
                                    results_true.push(result);
                                } else {
                                    results_false.push(result);
                                }
                            }
                        }
                        // console.log(element.name, results_true, results_false, conditions);
                        if (gubun == "||") {
                            if (results_true.length) {
                                return true;
                            }
                        } else {
                            if (conditions.length === results_true.length) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            },

            function: function (param, element) {
                return param(element);
            },
        },
        destroy: function () {
            $(this.currentForm).off(".validate").removeData("validator");
        },
        fixSpec: function (spec, name) {
            var valid = false;
            var properties =
                typeof spec !== "undefined" && typeof spec["properties"] !== "undefined" ? spec["properties"] : [];
            var name = typeof name !== "undefined" ? name : "";
            var values,
                propertyValue,
                propertyKey,
                fixPropertyKey,
                isArray,
                propertyName,
                dataValue,
                dataKey,
                valuePropertyName,
                valueValue,
                valueKey;
            var re = {};

            for (propertyKey in properties) {
                propertyValue = properties[propertyKey];
                fixPropertyKey = propertyKey;
                isArray = false;

                //consolelog(210, propertyKey,propertyKey.indexOf('[]'));

                if (-1 < propertyKey.indexOf("[]")) {
                    fixPropertyKey = propertyKey.replace("[]", "");
                    isArray = true;
                }
                propertyName = fixPropertyKey;

                if (name) {
                    propertyName = name + "[" + fixPropertyKey + "]";
                }
                if (isArray) {
                    propertyName = propertyName + "[]";
                }

                if ("group" == propertyValue["type"]) {
                    re = Object.assign(re, this.fixSpec(propertyValue, propertyName));
                } else {
                    re[propertyName] = propertyValue;
                }
            }
            //consolelog(377, re);
            return re;
        },
        // valid: function (data, isPush) {
        //     var data = typeof data !== "undefined" ? data : $(this.currentForm).elementObject();

        //     //consolelog('data view', data);
        //     this.load();
        //     this.focused = false;
        //     var result = this.validate(this.spec, data);
        //     this.focused = true;
        //     return result;
        // },
        defaultMessage: function (element, rule) {
            if (typeof rule === "string") {
                rule = { method: rule };
            }
            var message = $.validator.messages[rule.method];
            var theregex = /\$?\{(\d+)\}/g;
            if (typeof message === "function") {
                message = message.call(this, rule.parameters, element);
            } else if (theregex.test(message)) {
                message = $.validator.format(message.replace(theregex, "{$1}"), rule.parameters);
            }
            //consolelog(message);

            return message;
        },
        customMessage: function (messages, rule) {
            var language = $(this.currentForm).data("lang");
            if (typeof messages === "undefined") {
                var language = document.getElementsByTagName("html")[0].getAttribute("lang");
            }

            //alert(language);
            var theregex = /\$?\{(\d+)\}/g;
            if (
                typeof messages !== "undefined" &&
                typeof messages[rule.method] !== "undefined" &&
                typeof messages[rule.method] !== "object"
            ) {
                //consolelog('aaaaaaaa', typeof messages[rule.method]);
                return $.validator.format(messages[rule.method].replace(theregex, "{$1}"), rule.parameters);
            } else {
                if (
                    typeof messages !== "undefined" &&
                    typeof messages[language] !== "undefined" &&
                    typeof messages[language][rule.method] !== "undefined"
                ) {
                    return $.validator.format(
                        messages[language][rule.method].replace(theregex, "{$1}"),
                        rule.parameters
                    );
                }

                if (
                    typeof messages !== "undefined" &&
                    typeof messages[rule.method] !== "undefined" &&
                    typeof messages[rule.method][language] !== "undefined"
                ) {
                    return $.validator.format(
                        messages[rule.method][language].replace(theregex, "{$1}"),
                        rule.parameters
                    );
                }
                return undefined;
            }
        },
        findDefined: function () {
            for (var i = 0; i < arguments.length; i++) {
                if (arguments[i] !== undefined) {
                    return arguments[i];
                }
            }
            return undefined;
        },
        validationTargetFor: function (element) {
            // If radio/checkbox, validate first element in group instead
            if (this.checkable(element)) {
                element = this.findByName(element.name);
            }

            // Always apply ignore filter
            return $(element).not(this.settings.ignore)[0];
        },
    },
    // https://jqueryvalidation.org/jQuery.validator.addMethod/
    addMethod: function (name, method, message) {
        $.validator.methods[name] = method;
        $.validator.messages[name] = message !== undefined ? message : $.validator.messages[name];
    },
    methods: {
        // https://jqueryvalidation.org/required-method/
        required: function (value, element, param) {
            // consolelog("required", value, element, param);
            if (!this.depend(param, element)) {
                return "dependency-mismatch";
            }

            if (element.nodeName.toLowerCase() === "select") {
                // Could be an array for select-multiple or a string, both are fine this way
                //var val = $( element ).val();
                return value && value.length > 0;
            } else if (this.checkable(element)) {
                // console.log('element', element);
                return this.getLength(value, element) > 0;
            } else if (value) {
                return value.length > 0;
            }
            return false;
        },
        // https://jqueryvalidation.org/email-method/
        email: function (value, element) {
            // From https://html.spec.whatwg.org/multipage/forms.html#valid-e-mail-address
            // Retrieved 2014-01-14
            // If you have a problem with this implementation, report a bug against the above spec
            // Or use custom methods to implement your own email validation
            var emailReg =
                "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*";

            var emailReg2 = "[a-zA-Z0-9]+([._+-]?[a-zA-Z0-9]+)*@[a-zA-Z0-9]+([.-]?[a-zA-Z0-9]+)*(.[a-zA-Z]{2,})+";

            var emailReg3 = "/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}$/";

            return (
                this.optional(element) ||
                /^[a-zA-Z0-9]+([._%-]?[a-zA-Z0-9]+)*(\+[a-zA-Z0-9]+)?@[a-zA-Z0-9]+([.-]?[a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/.test(
                    value
                )
            );
        },
        // https://jqueryvalidation.org/url-method/
        url: function (value, element) {
            // Copyright (c) 2010-2013 Diego Perini, MIT licensed
            // https://gist.github.com/dperini/729294
            // see also https://mathiasbynens.be/demo/url-regex
            // modified to allow protocol-relative URLs
            return (
                this.optional(element) ||
                /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})).?)(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
                    value
                )
            );
        },

        // https://jqueryvalidation.org/date-method/
        date: function (value, element) {
            return this.optional(element) || !/Invalid|NaN/.test(new Date(value).toString());
        },

        // https://jqueryvalidation.org/dateISO-method/
        dateISO: function (value, element) {
            return this.optional(element) || /^\d{4}[\/\-](0?[1-9]|1[012])[\/\-](0?[1-9]|[12][0-9]|3[01])$/.test(value);
        },

        // https://jqueryvalidation.org/number-method/
        number: function (value, element) {
            return this.optional(element) || /^(?:-?\d+|-?\d{1,3}(?:,\d{3})+)?(?:\.\d+)?$/.test(value);
        },

        // https://jqueryvalidation.org/digits-method/
        digits: function (value, element) {
            return this.optional(element) || /^\d+$/.test(value);
        },

        // https://jqueryvalidation.org/minlength-method/
        minlength: function (value, element, param) {
            var length = $.isArray(value) ? value.length : this.getLength(value, element);
            return this.optional(element) || length >= param;
        },

        // https://jqueryvalidation.org/maxlength-method/
        maxlength: function (value, element, param) {
            var length = $.isArray(value) ? value.length : this.getLength(value, element);
            return this.optional(element) || length <= param;
        },

        // https://jqueryvalidation.org/rangelength-method/
        rangelength: function (value, element, param) {
            var length = $.isArray(value) ? value.length : this.getLength(value, element);
            return this.optional(element) || (length >= param[0] && length <= param[1]);
        },

        min: function (value, element, param, required) {
            // 기본 optional 체크
            if (this.optional(element)) {
                return true;
            }

            // required 메서드가 실패한 경우 무시
            if ("dependency-mismatch" == $.validator.methods.required.call(this, value, element, required)) {
                return true;
            }

            // 입력 요소의 타입에 따른 처리
            switch (element.type) {
                case "time":
                    // 시간 문자열을 초 단위 숫자로 변환
                    const valueTimeSeconds = this.convertTime(value);
                    const paramTimeSeconds = this.convertTime(param);
                    return valueTimeSeconds >= paramTimeSeconds;

                case "date":
                    // 날짜 문자열을 Date 객체로 변환
                    const valueDate = new Date(value);
                    const paramDate = new Date(param);
                    return valueDate >= paramDate;

                case "datetime-local":
                    // param이 시간 형식("HH:MM" 또는 "HH:MM:SS")인지 확인
                    if (typeof param === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(param)) {
                        // datetime-local 값에서 시간 부분만 추출
                        const timePart = value.split("T")[1];
                        const valueTimeSeconds = this.convertTime(timePart);
                        const paramTimeSeconds = this.convertTime(param);
                        return valueTimeSeconds >= paramTimeSeconds;
                    } else {
                        // 일반적인 datetime-local 비교
                        const valueDatetime = new Date(value);
                        const paramDatetime = new Date(param);
                        return valueDatetime >= paramDatetime;
                    }

                default:
                    // 기본 숫자 비교(기존 로직)
                    return value >= param;
            }
        },

        max: function (value, element, param, required) {
            // 기본 optional 체크
            if (this.optional(element)) {
                return true;
            }

            // required 메서드가 실패한 경우 무시
            if ("dependency-mismatch" == $.validator.methods.required.call(this, value, element, required)) {
                return true;
            }

            // 입력 요소의 타입에 따른 처리
            switch (element.type) {
                case "time":
                    // 시간 문자열을 초 단위 숫자로 변환
                    const valueTimeSeconds = this.convertTime(value);
                    const paramTimeSeconds = this.convertTime(param);
                    return valueTimeSeconds <= paramTimeSeconds;

                case "date":
                    // 날짜 문자열을 Date 객체로 변환
                    const valueDate = new Date(value);
                    const paramDate = new Date(param);
                    return valueDate <= paramDate;

                case "datetime-local":
                    // param이 시간 형식("HH:MM" 또는 "HH:MM:SS")인지 확인
                    if (typeof param === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(param)) {
                        // datetime-local 값에서 시간 부분만 추출
                        const timePart = value.split("T")[1];
                        const valueTimeSeconds = this.convertTime(timePart);
                        const paramTimeSeconds = this.convertTime(param);
                        return valueTimeSeconds <= paramTimeSeconds;
                    } else {
                        // 일반적인 datetime-local 비교
                        const valueDatetime = new Date(value);
                        const paramDatetime = new Date(param);
                        return valueDatetime <= paramDatetime;
                    }

                default:
                    // 기본 숫자 비교(기존 로직)
                    return value <= param;
            }
        },

        // https://jqueryvalidation.org/range-method/
        range: function (value, element, param) {
            return this.optional(element) || (value >= param[0] && value <= param[1]);
        },

        // https://jqueryvalidation.org/step-method/
        step: function (value, element, param) {
            var type = $(element).attr("type"),
                errorMessage = "Step attribute on input type " + type + " is not supported.",
                supportedTypes = ["text", "number", "range"],
                re = new RegExp("\\b" + type + "\\b"),
                notSupported = type && !re.test(supportedTypes.join()),
                decimalPlaces = function (num) {
                    var match = ("" + num).match(/(?:\.(\d+))?$/);
                    if (!match) {
                        return 0;
                    }

                    // Number of digits right of decimal point.
                    return match[1] ? match[1].length : 0;
                },
                toInt = function (num) {
                    return Math.round(num * Math.pow(10, decimals));
                },
                valid = true,
                decimals;

            // Works only for text, number and range input types
            // TODO find a way to support input types date, datetime, datetime-local, month, time and week
            if (notSupported) {
                throw new Error(errorMessage);
            }

            decimals = decimalPlaces(param);

            // Value can't have too many decimals
            if (decimalPlaces(value) > decimals || toInt(value) % toInt(param) !== 0) {
                valid = false;
            }

            return this.optional(element) || valid;
        },

        // https://jqueryvalidation.org/equalTo-method/
        equalTo: function (value, element, param) {
            // Bind to the blur event of the target in order to revalidate whenever the target field is updated
            // console.log("equalTo", value, element, param);
            if (-1 < param.indexOf(".")) {
                var dotName = element.name.replace(/\[/g, ".").replace(/\]/g, "");
                var dots = dotName.split(".");
                var targets = param.split(".");

                var news = [];
                for (i in targets) {
                    var target = targets[i];
                    if (target == "*") {
                        target = dots[i];
                    }
                    news.push(target);
                }
                var newName = this.getNameByArray(news);

                param = newName;
                //param = '[name="'+newName+'"]';
                if (typeof this.requiredWaves[newName] === "undefined") {
                    this.requiredWaves[newName] = [];
                }
                if (-1 === $.inArray(element.name, this.requiredWaves[newName])) {
                    this.requiredWaves[newName].push(element.name);
                }
            } else {
                //param = '[name="'+param+'"]';
            }

            var target = this.findByName(param);
            var self = this;
            // var target = $(param);
            // if (this.settings.onfocusout && target.not(".validate-equalTo-blur").length) {
            //     target.addClass("validate-equalTo-blur").on("blur.validate-equalTo", function () {
            //         self.settings.onfocusout(element);
            //     });
            // }

            // 한 번에 여러 이벤트 처리
            const events = [];

            if (this.settings.onfocusout && target.not(".validate-equalTo-blur").length) {
                target.addClass("validate-equalTo-blur");
                events.push("blur.validate-equalTo");
            }

            if (this.settings.oninput && target.not(".validate-equalTo-input").length) {
                target.addClass("validate-equalTo-input");
                events.push("input.validate-equalTo");
            }

            if (events.length > 0) {
                target.on(events.join(" "), function (e) {
                    if (e.type === "blur" && self.settings.onfocusout) {
                        self.settings.onfocusout(element);
                    } else if (e.type === "input" && self.settings.oninput) {
                        self.settings.oninput(element);
                    }
                });
            }

            // console.log("equalTo", value, target.val());
            return value === target.val();
        },

        // https://jqueryvalidation.org/remote-method/
        remote: function (value, element, param, method) {
            if (this.optional(element)) {
                return "dependency-mismatch";
            }

            method = (typeof method === "string" && method) || "remote";

            var previous = this.previousValue(element, method),
                validator,
                data,
                optionDataString;

            if (!this.settings.messages[element.name]) {
                this.settings.messages[element.name] = {};
            }
            previous.originalMessage = previous.originalMessage || this.settings.messages[element.name][method];
            this.settings.messages[element.name][method] = previous.message;

            param = (typeof param === "string" && { url: param }) || param;
            optionDataString = $.param($.extend({ data: value }, param.data));
            if (previous.old === optionDataString) {
                return previous.valid;
            }

            previous.old = optionDataString;
            validator = this;
            this.startRequest(element);
            data = {};
            data[element.name] = value;
            $.ajax(
                $.extend(
                    true,
                    {
                        mode: "abort",
                        port: "validate" + element.name,
                        dataType: "json",
                        data: data,
                        context: validator.currentForm,
                        success: function (response) {
                            var valid = response === true || response === "true",
                                errors,
                                message,
                                submitted;

                            validator.settings.messages[element.name][method] = previous.originalMessage;
                            if (valid) {
                                submitted = validator.formSubmitted;
                                validator.resetInternals();
                                validator.toHide = validator.errorsFor(element);
                                validator.formSubmitted = submitted;
                                validator.successList.push(element);
                                validator.invalid[element.name] = false;
                                validator.showErrors();
                            } else {
                                errors = {};
                                message =
                                    response ||
                                    validator.defaultMessage(element, { method: method, parameters: value });
                                errors[element.name] = previous.message = message;
                                validator.invalid[element.name] = true;
                                validator.showErrors(errors);
                            }
                            previous.valid = valid;
                            validator.stopRequest(element, valid);
                        },
                    },
                    param
                )
            );
            return "pending";
        },
    },
});

$.validator.addMethod(
    "in",
    function (value, element, param) {
        var IsInArr = function (needle, haystack) {
            for (var i = 0; i < haystack.length; i++) {
                consolelog(haystack[i] + "==" + needle);
                if (haystack[i] == needle) {
                    return true;
                }
            }
            return false;
        };

        consolelog(value, element, param, IsInArr(value, param));
        return this.optional(element) || IsInArr(value, param); // <-- Check if the value is in the array.
    },
    "Not a allowed value"
);

$.validator.addMethod(
    "even",
    function (value, element, param) {
        var number = parseInt(value);

        return this.optional(element) || number % 2 == 0;
    },
    "even number"
);

$.validator.addMethod(
    "odd",
    function (value, element, param) {
        var number = parseInt(value);

        return this.optional(element) || number % 2 == 1;
    },
    "odd number"
);

$.validator.addMethod(
    "recaptcha",
    function (value, element, param) {
        var response = grecaptcha.getResponse();
        if (response == "") {
            return false;
        } else {
            // I would like also to check server side if the recaptcha response is good
            return true;
        }
    },
    "You must complete the antispam verification"
);

// required일때 동작
$.validator.addMethod(
    "mincount",
    function (value, element, param, required) {
        // required 메서드가 실패한 경우 무시
        if ("dependency-mismatch" == $.validator.methods.required.call(this, value, element, required)) {
            return true;
        }
        var name = element.name.replace(/\[__([0-9a-z\-]{13,})__\]$/g, "[__");
        var count = 0;
        var elements = $('[name^="' + name + '"]:checked', this.currentForm);

        if (elements && elements.length > 0) {
            var length = elements.length;
            for (i = 0; i < length; i++) {
                if ($(elements[i]).val()) {
                    count++;
                }
            }
        } else {
            // select box는 값이 없어도 유효
            var elements = $('select[name^="' + name + '"]', this.currentForm);
            var length = elements.length;
            for (i = 0; i < length; i++) {
                if ($(elements[i])) {
                    count++;
                }
            }
        }
        // console.log("mincount", name, elements.length, count, param, count <= param);

        return this.optional(element) || count >= param;
    },
    "{0}개 이상 선택해주세요."
);

$.validator.addMethod(
    "maxcount",
    function (value, element, param, required) {
        // required 메서드가 실패한 경우 무시
        if ("dependency-mismatch" == $.validator.methods.required.call(this, value, element, required)) {
            return true;
        }
        var name = element.name.replace(/\[__([0-9a-z\-]{13,})__\]$/g, "[__");
        var elements = $('[name^="' + name + '"]:checked', this.currentForm);
        var count = 0;

        if (elements && elements.length > 0) {
            var length = elements.length;
            for (i = 0; i < length; i++) {
                if ($(elements[i]).val()) {
                    count++;
                }
            }
            consolelog(count, param, count >= param, count <= param);
        } else {
            // select box는 값이 없어도 유효
            var elements = $('select[name^="' + name + '"]', this.currentForm);
            var length = elements.length;
            for (i = 0; i < length; i++) {
                if ($(elements[i])) {
                    count++;
                }
            }
        }
        // console.log("maxcount", name, elements.length, count, param, count <= param);

        return this.optional(element) || count <= param;
    },
    "{0}개 이하로 선택해주세요."
);

$.validator.addMethod(
    "enddate",
    function (value, element, param) {
        if (-1 < param.indexOf(".")) {
            var dotName = element.name.replace(/\[/g, ".").replace(/\]/g, "");
            var dots = dotName.split(".");
            var targets = param.split(".");

            var news = [];
            for (i in targets) {
                var target = targets[i];
                if (target == "*") {
                    target = dots[i];
                }
                news.push(target);
            }
            var newName = this.getNameByArray(news);

            param = newName;
            //param = '[name="'+newName+'"]';
            if (typeof this.requiredWaves[newName] === "undefined") {
                this.requiredWaves[newName] = [];
            }
            if (-1 === $.inArray(element.name, this.requiredWaves[newName])) {
                this.requiredWaves[newName].push(element.name);
            }
        } else {
            //param = '[name="'+param+'"]';
        }
        consolelog("dddddddd", param, Date.parse(startDate), Date.parse(value));

        var target = this.findByName(param);
        var startDate = target.val();
        return Date.parse(startDate) <= Date.parse(value) || value == "";
    },
    "Must be greater than {0}."
);

$.validator.addMethod(
    "match",
    function (value, element, param) {
        var first = param[0];
        var last = param[param.length - 1];

        if (first != "^") {
            param = "^" + param;
        }
        if (last != "$") {
            param = param + "$";
        }
        consolelog("regex", param);
        var reg = new RegExp(param, "g");

        // console.log(element, value, element.value);
        if (value == "[]" || value == "0") {
            element.value = "";
        }

        return this.optional(element) || reg.test(value);
    },
    "패턴이 일치하지 않습니다."
);

$.validator.addMethod(
    // 다르면 ok
    "notEqual",
    function (value, element, param) {
        var keyword = element.dataset.keyword;
        // console.log("keyword", element, keyword, value, keyword == value);
        return this.optional(element) || keyword !== value;
    },
    "다른 값을 입력해주세요."
);

$.validator.addMethod(
    "password8",
    function (value, element, param) {
        // 비밀번호 정규식: 소문자, 대문자, 숫자, 특수문자 포함 8자 이상
        var passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

        // 빈 값이거나 optional이면 통과, 아니면 정규식 검사
        return this.optional(element) || passwordRegex.test(value);
    },
    "영문 대소문자, 숫자, 특수문자를 포함하여 8자 이상 입력하세요."
);

var uniques = {};
$.validator.addMethod(
    "unique",
    function (value, element, param) {
        if (param == "group") {
            var found = element.name.match(/(.*)\[__([0-9a-z\-]{13,})__\]\[([a-z0-9_\-]+)\]$/);
            consolelog("found", found, element.name);
            if (found && found.length) {
                var elements = $('[name^="' + found[1] + '"]', this.currentForm).filter(function () {
                    var re = new RegExp("\\[" + found[3] + "\\]$");
                    //consolelog('found 3', "\["+found[3]+"\]$", re.test(this.name), this.name);
                    return re.test(this.name);
                });
            } else {
                // errror
                throw new Error("error : unique group");
            }
        } else if (param == true) {
            var tmpname = element.name;
            var found = tmpname.match(/\[__([0-9a-z\-]{13,})__\]$/g);
            if (!found) {
                // file
                tmpname = tmpname.replace(/\[name\]$/, "");
            }

            var name = tmpname.replace(/\[__([0-9a-z\-]{13,})__\]$/g, "[__");

            var elements = $('[name^="' + name + '"]:visible', this.currentForm);
        }

        // console.log("elements", elements);
        // var unique = {};
        // for (var i = 0; i < elements.length; i++) {
        //     var getValueByElement = elements[i].value.replace("C:\\fakepath\\", "");
        //     unique[getValueByElement] = 1;
        // }

        // 현재 선택된 element의 값
        var currentValue = element.value.replace("C:\\fakepath\\", "");

        // elements 배열을 순회하면서 중복 체크
        var isUnique = true;
        for (var i = 0; i < elements.length; i++) {
            var compareValue = elements[i].value.replace("C:\\fakepath\\", "");

            // 자기 자신이 아니고, 값이 같은 경우 중복으로 처리
            if (element !== elements[i] && currentValue === compareValue) {
                isUnique = false;
                break;
            }
        }

        //console.log("unique", found2, isUnique);

        return this.optional(element) || isUnique;
    },
    "중복되지 않게 입력해주세요."
);

$.validator.addMethod(
    "minformcount",
    function (value, element, param) {
        // file form 제외하기 위해 [name] 제거, not hidden만 체크
        var name = element.name.replace(/\[__([0-9a-z\-]{13,})__\](\[name\])?$/g, "[__");
        var elements = $('[name^="' + name + '"]:not([type=hidden]', this.currentForm);

        return this.optional(element) || elements.length >= param;
    },
    "{0}개 이상 입력해주세요."
);

$.validator.addMethod(
    "maxformcount",
    function (value, element, param) {
        // file form 제외하기 위해 [name] 제거, not hidden만 체크
        var name = element.name.replace(/\[__([0-9a-z\-]{13,})__\](\[name\])?$/g, "[__");
        var elements = $('[name^="' + name + '"]:not([type=hidden]', this.currentForm);

        return this.optional(element) || elements.length <= param;
    },
    "{0}개 이하로 입력해주세요."
);

// $.validator.addMethod('mincount', function (value, element, param) {
//     var elements = this.findByName(element.name);
//     consolelog(elements.length, param);
//     return this.optional( element ) || elements.length > param;
// }, 'Duplicate values');

// $.validator.addMethod(
//     "equalTo",
//     function (value, element, param) {
//         var target = this.findByName(param);
//         if (this.settings.onfocusout && target.not(".validate-equalTo-blur").length) {
//             target.addClass("validate-equalTo-blur").on("blur.validate-equalTo", function () {
//                 //$(element).valid();
//             });
//         }
//         return value === target.val();
//     },
//     "Please enter the same value again."
// );

$.validator.addMethod(
    "maxTo",
    function (value, element, param) {
        if (-1 < param.indexOf(".")) {
            var dotName = element.name.replace(/\[/g, ".").replace(/\]/g, "");
            var dots = dotName.split(".");
            var targets = param.split(".");

            var news = [];
            for (i in targets) {
                var target = targets[i];
                if (target == "*") {
                    target = dots[i];
                }
                news.push(target);
            }
            var newName = this.getNameByArray(news);

            param = newName;
            //param = '[name="'+newName+'"]';
            if (typeof this.requiredWaves[newName] === "undefined") {
                this.requiredWaves[newName] = [];
            }
            if (-1 === $.inArray(element.name, this.requiredWaves[newName])) {
                this.requiredWaves[newName].push(element.name);
            }
        } else {
            //param = '[name="'+param+'"]';
        }

        var target = this.findByName(param);
        var startDate = target.val();

        consolelog("dddddddd", param, startDate, value);

        consolelog(target, value);
        return startDate <= value || value == "";
    },
    "Must be greater than {0}."
);

// Accept a value from a file input based on a required mimetype
$.validator.addMethod(
    "accept",
    function (value, element, param) {
        // Split mime on commas in case we have multiple types we can accept
        var typeParam = typeof param === "string" ? param.replace(/\s/g, "") : "image/*",
            optionalValue = this.optional(element),
            i,
            file,
            regex;

        // Element is optional
        if (optionalValue) {
            return optionalValue;
        }

        if ($(element).attr("type") === "file") {
            // Escape string to be used in the regex
            // see: https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
            // Escape also "/*" as "/.*" as a wildcard
            typeParam = typeParam
                .replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g, "\\$&")
                .replace(/,/g, "|")
                .replace(/\/\*/g, "/.*");

            // Check if the element has a FileList before checking each file
            if (element.files && element.files.length) {
                regex = new RegExp(".?(" + typeParam + ")$", "i");
                for (i = 0; i < element.files.length; i++) {
                    file = element.files[i];

                    // Grab the mimetype from the loaded file, verify it matches
                    if (!file.type.match(regex)) {
                        return false;
                    }
                }
            }
        }

        // Either return true because we've validated each file, or because the
        // browser does not support element.files and the FileList feature
        return true;
    },
    $.validator.format("Please enter a value with a valid mimetype.")
);
