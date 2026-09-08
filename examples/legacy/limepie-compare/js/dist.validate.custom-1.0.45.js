window.AJAX_UTILS_LOADED = true;
var ajaxLang = {
    ko: {
        success: "저장 완료",
        error: "저장 중단",
        confirm: "저장하시겠습니까?",
        cancel: "취소",
        Ok: "확인",
    },
    en: {
        success: "Saved",
        error: "Save stopped",
        confirm: "Are you sure you want to save?",
        cancel: "Cancel",
        Ok: "Confirm",
    },
    ja: {
        success: "保存完了",
        error: "保存停止",
        confirm: "保存しますか？",
        cancel: "キャンセル",
        Ok: "確認",
    },
    zh: {
        success: "保存完成",
        error: "保存停止",
        confirm: "保存しますか？",
        cancel: "キャンセル",
        Ok: "確認",
    },
};
// 공통 Ajax 응답 처리
function handleAjaxResponse(response, textStatus, jqXHR, form = null) {
    ajaxLoading(form, "저장 완료", "success");
    var process = function () {
        $(window).unbind("beforeunload");

        if (jqXHR.getResponseHeader("Location")) {
            document.location.href = jqXHR.getResponseHeader("Location");
        } else if (jqXHR.getResponseHeader("HistoryBack")) {
            window.history.back();
        } else if (jqXHR.getResponseHeader("LocationReload")) {
            document.location.reload();
        } else if ([204, 201].includes(jqXHR.status)) {
            document.location.reload();
        }

        isSubmit = false;
        if (submitButton) submitButton.disabled = false;
        ajaxLoadingEnd(form);
    };

    if (jqXHR.responseJSON?.message) {
        customAlert(jqXHR.responseJSON.message, process);
    } else {
        process();
    }
}

// 공통 Ajax 에러 처리
function handleAjaxError(jqXHR, textStatus, errorThrown, form = null) {
    ajaxLoading(form, "전송 중단", "danger");

    var process = function () {
        if (jqXHR.status === 401) {
            document.location.reload();
            return;
        }

        if (jqXHR.responseJSON?.errors && form) {
            handleFormErrors(jqXHR.responseJSON.errors, form);
        }

        isSubmit = false;
        if (submitButton) submitButton.disabled = false;
        ajaxLoadingEnd(form);
    };

    if (jqXHR.responseJSON?.message) {
        customAlert(jqXHR.responseJSON.message, process);
    } else {
        process();
    }
}

function addSlash(name) {
    return name.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

// 폼 에러 처리
function handleFormErrors(errors, form) {
    for (var idx in errors) {
        const error = errors[idx];
        const elementName = error.field;
        const type = error.type;
        const message = error.message;

        const element = $('[name="' + addSlash(elementName) + '"]', form);
        const testid = elementName.replace(/\[/g, "_").replace(/\]/g, "");
        const parent = element.closest(".input-group-wrapper");

        if (element.attr("data-keyword")) {
            element.attr("data-keyword", "");
        }
        if (type === "notfound") {
            // console.log("notfound", element);
            element.attr("data-keyword", element.val());
            // element.css("border-color", "red");
        }

        parent.find(".message_" + testid).remove();

        if (parent.find(".message_" + testid).length === 0) {
            parent.append(`<div class="message message_${testid}" style="color:red">${message}</div>`);
        }

        element[0]?.focus();
    }
}

// Summernote 처리
function processSummernote(form) {
    $(".summernote", form).each(function () {
        var summernote = $(this);
        if (summernote.summernote("isEmpty") || summernote.val() == "<p><br></p>") {
            summernote.val("");
        }
        if (summernote.summernote("codeview.isActivated")) {
            summernote.val(summernote.summernote("code"));
        }
    });
}

function ajaxLoading(formElement, text = "", status = "") {
    // purejs
    console.log("ajaxLoading", $(".loading-skeleton", formElement));
    if ($(".loading-skeleton", formElement).length) {
        // console.log("loading-skeleton found", text, status);
        $(".loading-skeleton", formElement).removeClass("d-none").addClass("d-flex");
        document.getElementById("loading-skeleton-text").innerHTML = text;
        if (status) {
            document.getElementById("loading-skeleton-content").classList.add(status);
        } else {
            document.getElementById("loading-skeleton-content").classList.remove("success", "danger");
        }
        // $("#loading-skeleton").css("display", "flex");
        // $(formElement).closest(".form-container").addClass("ajax-loading");
    } else {
        // console.log("loading-skeleton not found");
    }
}

function ajaxLoadingEnd(formElement) {
    // purejs
    if ($(".loading-skeleton", formElement).length) {
        // console.log("loading-skeleton end found", $(".loading-skeleton", formElement));
        $(".loading-skeleton", formElement).removeClass("d-flex").addClass("d-none");
        // $("#loading-skeleton").css("display", "none");
        // $(formElement).closest(".form-container").removeClass("ajax-loading");
    } else {
        // console.log("loading-skeleton", formElement);
        // console.log("loading-skeleton end not found", $(".loading-skeleton", formElement));
    }
}
// function focusElement(element) {
//     if (
//         $(element).is(":visible") &&
//         !$(element).is('input[type="file"]') &&
//         $(element).width() !== 1 &&
//         $(element).height() !== 1
//     ) {
//         element.focus();
//     } else {
//         $(element).parent().scrollView();
//         $(element)
//             .closest(".input-group-wrapper")
//             .find("input, textarea, select, button")
//             .not("input[type=hidden],input[type=file],input[type=reset],input[type=image]")
//             .filter(":enabled:visible:first")
//             .focus();
//     }
// }

// function focusElement(element) {
//     console.log("focusElement", element);
//     const $element = $(element);
//     let addedTabindex = false;

//     if (!$element.is(":input, a[href], button, [tabindex]")) {
//         $element.attr("tabindex", "-1");
//         addedTabindex = true;
//     }
//     console.log("addedTabindex", addedTabindex);
//     $element.focus();

//     if (addedTabindex) {
//         setTimeout(() => {
//             $element.removeAttr("tabindex");
//         }, 100);
//     }
// }
// 요소가 보이는지 확인
function isElementVisible($element) {
    return $element.is(":visible") && $element[0] && $element[0].offsetWidth > 0 && $element[0].offsetHeight > 0;
}

// 포커스 함수
function focusElement(element) {
    const $element = $(element);

    if (isElementVisible($element)) {
        // 직접 포커스
        if (!$element.is(":input, a[href], button, [tabindex]")) {
            $element.attr("tabindex", "-1");
        }
        $element.focus();
    } else {
        // 대체 포커스
        const $focusTarget = $element.closest(".form-element").find('[tabindex="-1"]').first();

        if ($focusTarget.length && isElementVisible($focusTarget)) {
            $focusTarget.focus();
            $focusTarget[0].scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
}

async function processCaptcha(captcha) {
    // ready를 Promise로 래핑
    await new Promise((resolve) => {
        dualcaptcha.ready(captcha.provider, resolve);
    });

    // execute는 이미 Promise를 반환함
    return await dualcaptcha.execute(captcha.provider, captcha.site_key, { action: "submit" });
}

var isSubmit = false;
var submitButton = null;

async function submitFunction(formElement, e, confirmMessage = null, validate_error_message = null, captcha = null) {
    ajaxLoading(formElement, "폼 검사 중");
    e.preventDefault();
    // e.stopPropagation();

    //submitButton = e.submitter || formElement.querySelector('button[type="submit"], input[type="submit"]');
    // console.log("submitButton: ", submitButton);
    // console.log("isSubmit before: ", isSubmit);

    if (isSubmit) {
        customAlert("전송중입니다. 잠시만 기다려 주세요.");
        return false;
    }
    isSubmit = true;
    if (submitButton) submitButton.disabled = true;

    try {
        if (e.submitter) {
            formElement.submitted.value = e.submitter.value;
        }
        const $form = $(formElement);
        processSummernote(form);

        const options = getAjaxOptions($form.attr("action"), "POST", $form);

        var cancelProcess = function (is_submit = true, element = null) {
            ajaxLoadingEnd(formElement);
            if (true === is_submit) {
            } else {
                if (element) {
                    // console.log("element", element);
                    focusElement(element);
                }
            }
            isSubmit = false;
            if (submitButton) submitButton.disabled = false;
            return false;
        };

        var successProcess = function () {
            ajaxLoading(formElement, "저장 중");

            const formData = new FormData(formElement);
            options.data = formData;
            options.processData = false; // 중요! FormData를 문자열로 변환하지 않도록
            options.contentType = false; // 중요! multipart/form-data로 전송되도록

            $.ajax(options);

            $form.data("serialize", $form.serialize());
            isSubmit = false;
        };

        $form
            .validate()
            .loadvalidWithAnimation()
            .then(async ({ isValid, element }) => {
                if (isValid) {
                    if (captcha) {
                        const token = await processCaptcha(captcha);
                        console.log("token", token);
                        document.getElementById("g-recaptcha-response").value = token;
                    }
                    // 모든 항목이 유효할 때 처리
                    ajaxLoading(formElement, "유효성 검사 완료", "success");
                    if (confirmMessage) {
                        customConfirm(confirmMessage, successProcess, () => cancelProcess(true));
                    } else {
                        successProcess();
                    }
                } else {
                    // 유효하지 않은 항목이 있을 때 처리
                    ajaxLoading(this.currentForm, "유효성 검사 중단", "danger");
                    // console.log("not validelement: ", element);
                    if (validate_error_message) {
                        customAlert(validate_error_message, () => cancelProcess(false, element));
                    } else {
                        cancelProcess(false, element);
                    }
                }
            });
        delete options.beforeSend;

        // if (options.beforeSend) {
        //     if (!options.beforeSend()) {
        //         if (!cancelProcess()) {
        //             return false;
        //         }
        //     }
        //     delete options.beforeSend;
        // }

        // ajaxLoading(formElement, "폼 검사 완료", "success");
        // if (confirmMessage) {
        //     customConfirm(confirmMessage, successProcess, cancelProcess);
        // } else {
        //     successProcess();
        // }

        return false;
    } catch (e) {
        console.log(e);
        return false;
    }
}

// $(function () {
//     // submitter polyfill
//     var lastBtn = null;
//     document.addEventListener(
//         "click",
//         function (e) {
//             if (!e.target.closest) return;
//             lastBtn = e.target.closest("button, input[type=submit]");
//         },
//         true
//     );
//     document.addEventListener(
//         "submit",
//         function (e) {
//             if (e.submitter) return;
//             var canditates = [document.activeElement, lastBtn];
//             for (var i = 0; i < canditates.length; i++) {
//                 var candidate = canditates[i];
//                 if (!candidate) continue;
//                 if (!candidate.form) continue;
//                 if (!candidate.matches("button, input[type=button], input[type=image]")) continue;
//                 e.submitter = candidate;
//                 return;
//             }
//             e.submitter = e.target.querySelector("button, input[type=button], input[type=image]");
//         },
//         true
//     );
// });

$(function () {
    // $("form").data("serialize", $("form").serialize());

    // $(window).bind("beforeunload", function (e) {
    //     if ($("form").serialize() != $("form").data("serialize")) return true;
    //     else e = null;
    // });
    // $(document).on("click", "a", function (e) {
    //     if ($("form").length && $("form").serialize() != $("form").data("serialize")) {
    //         if (confirm("저장하지 않은 정보는 사라집니다. 이 페이지에서 나가시겠습니까?")) {
    //             document.location.href = $(this).attr("href");
    //         }
    //         e.preventDefault();
    //         return false;
    //     }
    // });

    // $(document)
    //     .off("click", "a[data-page-leave=true]")
    //     .on("click", "a[data-page-leave=true]", function (e) {
    //         if (confirm("저장하지 않은 정보는 사라집니다. 이 페이지에서 나가시겠습니까?")) {
    //             document.location.href = $(this).attr("href");
    //         }
    //         e.preventDefault();
    //         return false;
    //     });

    function executeOnload($input) {
        if (!$input.data("onload-executed")) {
            // console.log('---------');
            var onloadFunc = new Function("return function() { " + $input.data("onload") + " }")();
            onloadFunc.call($input[0]); // this를 input 요소로 바인딩
            $input.data("onload-executed", true);
        }
    }

    // 페이지 로드 시 이미 존재하는 요소들에 대해 실행
    $("input[data-onload]").each(function () {
        executeOnload($(this));
    });

    // MutationObserver 설정
    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === "childList") {
                $(mutation.addedNodes)
                    .find("input[data-onload]")
                    .each(function () {
                        executeOnload($(this));
                    });
            }
        });
    });

    // 전체 문서를 관찰 대상으로 설정
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    $(document)
        .off("click", "a[data-method]")
        .on("click", "a[data-method]", function (e) {
            e.preventDefault();
            const self = $(this);
            const method = self.attr("data-method").toLowerCase();
            const form = self.closest("form");

            // GET 요청 처리
            if (method === "get") {
                makeAjaxRequest(self.attr("href"), method);
                return false;
            }

            // DELETE 또는 PUT 요청 처리
            if (method === "delete" || method === "put") {
                const actionText = method === "delete" ? "삭제" : "수정";
                let result = false;
                let value2 = "";
                const description = self.attr("data-description") || "";
                const dataValue = self.attr("data-value");

                if (description) {
                    if (dataValue) {
                        result = window.prompt(description);
                        value2 = dataValue;
                    } else {
                        result = window.confirm(description);
                        value2 = true;
                    }
                } else if (dataValue) {
                    result = window.prompt(
                        `${actionText}하시겠습니까?\n${actionText}하시려면 아래의 칸에 "${dataValue}"을 입력해주세요.`
                    );
                    value2 = dataValue;
                } else {
                    result = true;
                    value2 = true;
                }

                if (!result) {
                    alert(`${actionText}가 중단 되었습니다.`);
                    return false;
                }

                if (result != value2) {
                    alert(`${actionText} 확인 문자열이 일치하지 않습니다.\n${actionText}가 중단 되었습니다.`);
                    return false;
                }

                makeAjaxRequest(self.attr("href"), method, form);
            }

            return false;
        });
});

// Summernote 처리
function processSummernote(form) {
    $(".summernote", form).each(function () {
        var summernote = $(this);
        if (summernote.summernote("isEmpty") || summernote.val() == "<p><br></p>") {
            summernote.val("");
        }
        if (summernote.summernote("codeview.isActivated")) {
            summernote.val(summernote.summernote("code"));
        }
    });
}

// Ajax 요청 옵션 생성
function getAjaxOptions(url, method, $form = null) {
    const options = {
        url: url,
        type: method,
        dataType: "json",
        success: (response, textStatus, jqXHR) => handleAjaxResponse(response, textStatus, jqXHR, form),
        error: (jqXHR, textStatus, errorThrown) => handleAjaxError(jqXHR, textStatus, errorThrown, form),
    };

    if ($form) {
        options.beforeSubmit = function (formData, form, options) {
            if ($form[0].submitted.value == "save") {
                return true;
            }
            return $form.validate().loadvalid();
        };
        options.beforeSend = function (xhr, options) {
            if ($form[0].submitted.value == "save") {
                return true;
            }
            return $form.validate().loadvalid();
        };
    }

    return options;
}

function makeAjaxRequest(url, method, form = null) {
    if (form && form.length) {
        processSummernote(form);
        return form.ajaxSubmit(getAjaxOptions(url, method, form));
    }
    return $.ajax(getAjaxOptions(url, method));
}

function isInViewpoint(el) {
    if (typeof jQuery === "function" && el instanceof jQuery) {
        el = el[0];
    }
    if (!el) {
        console.log("el is not found");
        return false;
    }
    var top = el.offsetTop;
    var left = el.offsetLeft;
    var width = el.offsetWidth;
    var height = el.offsetHeight;

    while (el.offsetParent) {
        el = el.offsetParent;
        top += el.offsetTop;
        left += el.offsetLeft;
    }

    return (
        top >= window.pageYOffset &&
        left >= window.pageXOffset &&
        top + height <= window.pageYOffset + window.innerHeight &&
        left + width <= window.pageXOffset + window.innerWidth
    );
}
// 공통 유틸리티 함수
function getPreviewStyle(input) {
    const view_width = Number(input.data("preview-max-width"));
    const view_height = Number(input.data("preview-max-height"));

    let style = "";
    let attributes = "";

    if (view_width) {
        style += `max-width:${view_width}px;`;
        attributes += ` width="${view_width}"`;
    }
    if (view_height) {
        style += `max-height:${view_height}px;`;
        attributes += ` height="${view_height}"`;
    }

    return style ? `style='${style}'` : "";
}

function clearPreview(input) {
    if (input.closest(".input-group-wrapper").find("div.form-preview")) {
        input.closest(".input-group-wrapper").find("div.form-preview").remove();
    }
}

function appendPreviewImage(input, imageUrl, style) {
    const previewHtml = `<div class="clone-element form-preview"><img src="${imageUrl}" class="form-preview-image" ${style}></div>`;

    if (input.parent().hasClass("input-group")) {
        input.parent().after(previewHtml);
    } else {
        input.after(previewHtml);
    }
}

function validateImageDimensions(input, width, height) {
    const max_width = Number(input.data("max-width"));
    const min_width = Number(input.data("min-width"));
    const max_height = Number(input.data("max-height"));
    const min_height = Number(input.data("max-width"));

    if (max_width && width > max_width) {
        alert(`가로 ${max_width} 이하의 이미지만 허용됩니다.`);
        return false;
    }
    if (min_width && width < min_width) {
        alert(`가로 ${min_width} 이상의 이미지만 허용됩니다.`);
        return false;
    }
    if (max_height && height > max_height) {
        alert(`세로 ${max_height} 이하의 이미지만 허용됩니다.`);
        return false;
    }
    if (min_height && height < min_height) {
        alert(`세로 ${min_height} 이상의 이미지만 허용됩니다.`);
        return false;
    }
    return true;
}

function clearInput(input) {
    input.prev().val("");
    input.val("");
    input.closest("form").data("validator").checkByElements(input);
}

// URL 미리보기 함수
function createUrlPreviewLayer(input, url) {
    if (!input.hasClass("form-control-image")) return;

    clearPreview(input);
    const style = getPreviewStyle(input);
    appendPreviewImage(input, url, style);
}

function copyImageForm(element) {
    var $element = $(element);
    var selectedData = $(element).select2("data")[0];
    var cover_url = selectedData.cover_url;
    var file_name_alias_seq = selectedData.cover_file_name_alias_seq;
    var text = selectedData.text;

    var input = $element.closest(".form-group").find(".battle-item-cover").find(".form-control-image");
    createUrlPreviewLayer(input, cover_url);

    $element.closest(".form-group").find(".battle-item-name").val(text);

    var formControlFile = $element
        .closest(".form-group")
        .find(".battle-item-cover")
        .find(".form-control-file:not(.form-control-image)");
    formControlFile.val(cover_url);

    // form-control-file 요소의 type을 text로 변경하고 name 속성도 변경
    var formControlImage = $element.closest(".form-group").find(".battle-item-cover").find(".form-control-image");
    var originalName = input.attr("name");
    formControlImage.attr("name", originalName + "[name]");
    //console.log(formControlImage, originalName);
    formControlImage.attr("type", "hidden").val(cover_url);
    formControlImage.addClass("form-control-filetext");

    // .url 요소 확인 및 생성
    var battleItemCover = $element.closest(".form-group").find(".battle-item-cover");
    var urlInput = battleItemCover.find(".url");
    if (urlInput.length === 0) {
        urlInput = $('<input type="hidden" name="' + originalName + '[url]" class="clone-element url">');
        formControlImage.after(urlInput);
    }
    urlInput.val(cover_url);

    // .file_name_alias_seq 요소 확인 및 생성
    var fileNameAliasSeqInput = battleItemCover.find(".file_name_alias_seq");
    if (fileNameAliasSeqInput.length === 0) {
        fileNameAliasSeqInput = $(
            '<input type="hidden" name="' +
            originalName +
            '[file_name_alias_seq]" class="clone-element file_name_alias_seq">'
        );
        formControlImage.after(fileNameAliasSeqInput);
    }
    fileNameAliasSeqInput.val(file_name_alias_seq);

    var targetValids = $(".valid-target", $element.closest(".form-group"));
    if (targetValids.length > 0) {
        $element.closest("form").validate().checkByElements(targetValids);
    }
}
// 파일 업로드 미리보기 함수
function createUploadPreviewLayer(input, event) {
    if (!input.hasClass("form-control-image")) return;

    clearPreview(input);
    const style = getPreviewStyle(input);

    const reader = new FileReader();
    reader.onload = function (e) {
        const image = new Image();
        image.src = e.target.result;

        image.onload = function () {
            if (!validateImageDimensions(input, this.width, this.height)) {
                clearInput(input);
                return;
            }
            appendPreviewImage(input, reader.result, style);
        };
    };

    if (event?.target?.files?.length) {
        reader.readAsDataURL(event.target.files[0]);
        input.prev().val(event.target.files[0].name);
    } else {
        input.prev().val("");
    }
}

$(function () {
    $.fn.scrollView = function () {
        // if ($(this).length === 0) {
        //     console.log("this is not found", this);
        //     return;
        // }
        // console.log("scrollView", this);
        if (!isInViewpoint(this)) {
            $([document.documentElement, document.body])
                .stop()
                .animate(
                    {
                        scrollTop: $(this).offset().top - 100,
                    },
                    100
                );
        }
    };

    $(document).on("change", ":file", function (event) {
        //console.log('------------------------------------select2Template');
        //alert(1);
        var form = $(this).closest("form")[0];
        if (form) {
            // console.log(form);
            var validator = $.data(form, "validator");
            if (validator) {
                validator.isFocus = true;

                var input = $(this),
                    numFiles = input.get(0).files ? input.get(0).files.length : 1,
                    label = input.val().replace(/\\/g, "/").replace(/.*\//, "");

                label = label ? label : "선택된 파일 없음";
                input.trigger("fileselect", [numFiles, label]);

                createUploadPreviewLayer(input, event);

                input.closest("form").data("validator").checkByElements(input);
                //validator.loadvalid();
            }
        }
    });

    $(":file").on("fileselect", function (event, numFiles, label) {
        consolelog(numFiles);
        consolelog(label);
    });
});
const uniqid = (function () {
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +    revised by: Kankrelune (http://www.webfaktory.info/)
    // %        note 1: Uses an internal counter (in closure) to avoid collision
    // *     example 1: uniqid();
    // *     returns 1: 'a30285b160c14'
    // *     example 2: uniqid('foo');
    // *     returns 2: 'fooa30285b1cd361'
    // *     example 3: uniqid('bar', true);
    // *     returns 3: 'bara20285b23dfd1.31879087'

    let uniqidSeed = Math.floor(Math.random() * 0x75bcd15);

    const formatSeed = function (seed, reqWidth) {
        seed = parseInt(seed, 10).toString(16); // to hex str
        if (reqWidth < seed.length) {
            // so long we split
            return seed.slice(seed.length - reqWidth);
        }
        if (reqWidth > seed.length) {
            // so short we pad
            return Array(1 + (reqWidth - seed.length)).join("0") + seed;
        }
        return seed;
    };

    return function (prefix, more_entropy) {
        if (typeof prefix === "undefined") {
            prefix = "";
        }

        let retId;

        uniqidSeed++;

        retId = prefix; // start with prefix, add current milliseconds hex string
        retId += formatSeed(parseInt(new Date().getTime() / 1000, 10), 8);
        retId += formatSeed(uniqidSeed, 5); // add seed hex string
        if (more_entropy) {
            // for more entropy we add a float lower to 10
            retId += (Math.random() * 10).toFixed(8).toString();
        }

        return retId;
    };
})();

let previousResults = null;

const searchCache = {};

// var lastSearchTerm = "";
function select2(id, minimumInputLength = 2, delay = 250, containerClass = "") {
    var $select = $("#" + id);
    var previousClass = "";
    var apiServer = new Function("return " + $("#" + id).data("api-server"))();
    var select2Template = function (state, optiondiv, options) {
        // console.log("state", state.element?.dataset);
        if (!state) {
            return "";
        }
        if (!state.id) {
            return state.text;
        }
        // console.log(options.name);
        // var optimage = $(state.element);
        // console.log(optimage);
        const $container = $select.closest(".input-group").find(".select2-container");
        // console.log(container);
        var term = $(".select2-search__field").val(); // 검색어 가져오기
        var text = state.text;

        var prepend_text = state?.prepend_text ?? state.element?.dataset?.prependText ?? "";
        var append_text = state?.append_text ?? state.element?.dataset?.appendText ?? "";
        var cover_url = state?.cover_url ?? state.element?.dataset?.coverUrl ?? "";

        //console.log(cover_url);
        if (term) {
            var re = new RegExp("(" + term + ")", "gi");
            text = text.replace(re, "<span class='highlightText'>$1</span>");
        }

        if (state?.cover_file_name_alias_seq) {
            var option = $select.find('option[value="' + state.id + '"]');
            // if (option.length === 0) {
            //     option = new Option(state.text, state.id, true, true);
            //     element.append(option);
            // }
            $(option).attr("data-cover-file-alias-seq", state.cover_file_name_alias_seq);
        }
        // console.log(state);
        if (previousClass && options.name == "templateSelection") {
            console.log("previousClass", previousClass, containerClass);
            $container.removeClass(previousClass);
        }
        $container.addClass(containerClass);
        // $container.removeClass("border bg-striped border-secondary border-primary border-danger");

        var className = "";
        if (state?.class) {
            className = state.class;
        } else if (state.element?.dataset?.class) {
            className = state.element.dataset.class;
        }

        if (options.name === "templateSelection") {
            $container.addClass(className);
            previousClass = className;
            // console.log(options.name, previousClass);
            className = "";
        }
        //console.log(state?.class ?? "1*", state.element?.dataset?.class ?? "2*");
        // console.log(className);
        if (cover_url) {
            return $(
                `<div class="cover-item d-flex align-items-center ${className}">
                    <div class="select2-result-image">
                        <img src="${cover_url.toString()}" height=20 style="margin-right: 5px;">
                    </div>
                    <div class="select2-prepend-text">${prepend_text.toString()}</div>
                    <div class="flex-grow-1 min-w-0 text-truncate me-2">${text}</div>
                    <div class="select2-append-text d-none d-md-block ms-auto flex-shrink-0">${append_text.toString()}</div>
                </div>`
            );
        } else {
            return $("<div class='text-item d-flex align-items-center " + className + "'>" + text + "</div>");
        }
    };

    $select
        .select2({
            appendTo: $("#custom-container_" + id),
            // templateSelection: select2Template,
            // templateResult: select2Template,
            templateSelection: function (data, optiondiv) {
                return select2Template(data, optiondiv, { name: "templateSelection" });
            },
            templateResult: function (data, optiondiv) {
                return select2Template(data, optiondiv, { name: "templateResult" });
            },
            placeholder: "",
            language: {
                errorLoading: function () {
                    return "결과를 읽을수 없습니다.";
                },
                inputTooLong: function (e) {
                    var t = e.input.length - e.maximum,
                        n = "Please delete " + t + " character";

                    return e.maximum + " 글자만 입력할수 있습니다.";
                    // return t != 1 && (n += "s"), n;
                },
                inputTooShort: function (e) {
                    var t = e.minimum - e.input.length,
                        n = "Please enter " + t + " or more characters";

                    n = e.minimum + "글자 이상 입력해주세요.";
                    return n;
                },
                loadingMore: function () {
                    return "다음 결과를 읽는 중입니다.";
                },
                maximumSelected: function (e) {
                    var t = "You can only select " + e.maximum + " item";
                    return e.maximum != 1 && (t += "s"), t;
                },
                noResults: function () {
                    return "결과가 없습니다.";
                },
                searching: function () {
                    return "검색중입니다.";
                },
                removeAllItems: function () {
                    return "Remove all items";
                },
            },
            ajax: {
                url: apiServer,
                method: "post",
                dataType: "json",
                delay: delay,
                transport: function (params, success, failure) {
                    // 검색어
                    const term = params.data.q;

                    // 캐시에 해당 검색어의 결과가 있는지 확인
                    // if (searchCache[term]) {
                    //     console.log("캐시에서 데이터를 가져옵니다:", term);
                    //     // 캐시된 결과 반환
                    //     return success(searchCache[term]);
                    // }

                    // 캐시에 없으면 AJAX 요청 실행
                    const $request = $.ajax(params);

                    $request.then(function (data) {
                        // 결과를 캐시에 저장
                        // searchCache[term] = data;
                        // 결과 반환
                        return success(data);
                    });

                    $request.fail(failure);

                    return $request;
                },
            },
            minimumInputLength: minimumInputLength,
            theme: "default " + " " + containerClass + " " + id + "_select2",
        })
        // .on("select2:searching", function () {
        //     console.log("searching");
        //     $(".select2-results__message").remove();
        //     $(".select2-results__options").append('<li class="select2-results__message">검색 중...</li>');
        // })
        .on("select2:open", function (e) {
            $(".select2-search__field").attr("placeholder", " 검색어를 입력하세요");
        })
        .on("select2:open", function () {
            // if ($(this).attr("last-search")) {
            //     console.log("last keyword: " + $(this).attr("last-search"));
            //     $("input.select2-search__field").val($(this).attr("last-search")).trigger("input");
            // }
            // window.setTimeout(function () {
            //     document.querySelector("input.select2-search__field").focus();
            // }, 0);

            const lastSearch = $(this).attr("last-search");
            if (lastSearch) {
                console.log("last keyword: " + lastSearch);

                setTimeout(() => {
                    // select2 인스턴스에 직접 검색어 설정
                    $(this).data("select2").dropdown.$search.val(lastSearch);

                    // 검색 수행
                    $(this).data("select2").trigger("query", {
                        term: lastSearch,
                    });

                    // 포커스
                    $(this).data("select2").dropdown.$search.focus();
                }, 100);
            } else {
                setTimeout(() => {
                    document.querySelector("input.select2-search__field").focus();
                }, 0);
            }
        })
        .on("select2:select", function (e) {
            //console.log(element);

            var selectedOption = e.params.data;

            $(this).find("option:selected").attr("data-cover-url", selectedOption.cover_url);

            var found = $select.attr("name").match(/(.*)\[__([0-9a-z\-]{13,})__\]$/);

            if (found) {
                var parent = $select.closest(".form-element-wrapper");

                $select.closest("form").validate().checkByElements(parent.find("select"));
                // console.log("선택된 데이터:", e.params.data, parent.find("select"));
            }
        })
        .on("select2:closing", function () {
            $(this).attr("last-search", $("input.select2-search__field").val());
            $(this).data("html", $(".select2-results__options").html());
        });

    // setTimeout(() => {
    //     const $container = $select.next(".select2-container");
    //     var $rep = $("#custom-container_" + id);
    //     var containerClass = $rep.attr("class");
    //     // console.log(containerClass);
    //     $container.addClass(containerClass);
    //     $rep.replaceWith($container);
    // }, 0);

    // console.log($("#" + id));
}

function editorjs(id, imageserver) {
    var editor = new EditorJS({
        /**
         * Enable/Disable the read only mode
         */
        readOnly: false,

        /**
         * Wrapper of Editor
         */
        holder: id,

        /**
         * Common Inline Toolbar settings
         * - if true (or not specified), the order from 'tool' property will be used
         * - if an array of tool names, this order will be used
         */
        // inlineToolbar: ['link', 'marker', 'bold', 'italic'],
        // inlineToolbar: true,

        /**
         * Tools list
         */
        tools: {
            /**
             * Each Tool is a Plugin. Pass them via 'class' option with necessary settings {@link docs/tools.md}
             */
            header: {
                class: Header,
                inlineToolbar: ["marker", "link"],
                config: {
                    placeholder: "Header",
                },
                shortcut: "CMD+SHIFT+H",
            },

            /**
             * Or pass class directly without any configuration
             */
            image: {
                class: ImageTool,
                config: {
                    endpoints: {
                        byFile: imageserver, //'http://localhost:8008/uploadFile', // Your backend file uploader endpoint
                        byUrl: "http://localhost:8008/fetchUrl", // Your endpoint that provides uploading by Url
                    },
                },
            },
            audioPlayer: {
                class: AudioPlayer,
                inlineToolbar: true,
            },
            list: {
                class: List,
                inlineToolbar: true,
                shortcut: "CMD+SHIFT+L",
            },

            checklist: {
                class: Checklist,
                inlineToolbar: true,
            },

            quote: {
                class: Quote,
                inlineToolbar: true,
                config: {
                    quotePlaceholder: "Enter a quote",
                    captionPlaceholder: "Quote's author",
                },
                shortcut: "CMD+SHIFT+O",
            },

            // warning: Warning,

            marker: {
                class: Marker,
                shortcut: "CMD+SHIFT+M",
            },

            code: {
                class: CodeTool,
                shortcut: "CMD+SHIFT+C",
            },

            delimiter: Delimiter,

            inlineCode: {
                class: InlineCode,
                shortcut: "CMD+SHIFT+C",
            },

            linkTool: LinkTool,

            embed: Embed,

            table: {
                class: Table,
                inlineToolbar: true,
                shortcut: "CMD+ALT+T",
            },
        },

        /**
         * This Tool will be used as default
         */
        // defaultBlock: 'paragraph',

        /**
         * Initial Editor data
         */
        data: {
            blocks: [],
        },
        // onReady: function () {
        //     saveButton.click();
        // },
        onChange: function (api, event) {
            console.log("something changed", event);
        },
    });
}
function extractYouTubeID(url) {
    // 유튜브 URL에서 비디오 ID를 추출하는 정규 표현식
    var regex =
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

    // 정규 표현식을 사용하여 URL에서 비디오 ID 추출
    var match = url.match(regex);

    // 매치 결과가 있고, 첫 번째 캡처 그룹(비디오 ID)의 길이가 11자리인 경우
    if (match && match[1].length === 11) {
        return match[1];
    } else {
        // 유효하지 않은 유튜브 URL의 경우
        return null;
    }
}

function editor_tinymce(id, height, upload, readonly) {
    var textarea = $(id);
    var form = $(textarea).closest("form");
    var validator = form.data("validator");

    // TinyMCE에 소셜 미디어 임베드 플러그인 추가하기
    tinymce.PluginManager.add("socialembed", function (editor) {
        // 소셜 미디어 URL 패턴 정의
        const patterns = [
            // YouTube
            // YouTube 정규식 및 콜백 함수 수정
            {
                regex: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)/i,
                embedCallback: function (match) {
                    const videoId = match[1];
                    const isShorts = match[0].includes("/shorts/");

                    // Shorts인 경우 세로형 비율 정보 추가
                    const aspectClass = isShorts ? "youtube-shorts" : "youtube-standard";

                    return `
                    <blockquote
                        class="media-container youtube-media ${aspectClass}"
                        data-src="https://www.youtube.com/embed/${videoId}"
                        data-shorts="${isShorts}"
                    ></blockquote>
                    `;
                },
            },
            // Instagram - 정규식과 임베드 URL 생성 로직 수정
            {
                regex: /(?:https?:\/\/)?(?:www\.)?instagram\.com(?:\/(?:[^/]+))?\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)\/?/i,
                embedCallback: function (match) {
                    const postId = match[1];
                    const isReels = match[0].includes("/reel/");

                    // URL 형식에 따라 적절한 임베드 URL 선택
                    let embedUrl;
                    if (match[0].includes("/reel/")) {
                        // /reels/ 형식은 원본 URL 형식 유지
                        embedUrl = "https://www.instagram.com/reel/" + postId + "";
                    } else {
                        // 다른 형식은 /p/ 형식 사용
                        embedUrl = "https://www.instagram.com/p/" + postId + "";
                    }

                    const aspectClass = isReels ? "instagram-reels" : "instagram-standard";

                    return `
                    <blockquote
                        class="media-container instagram-media ${aspectClass}"
                        data-instgrm-captioned
                        data-instgrm-permalink="${embedUrl}"
                        data-instgrm-version="14"
                    ></blockquote>
                    `;

                    return (
                        '<div class="social-embed instagram-embed"><iframe src="' +
                        embedUrl +
                        '" width="400" height="480" frameborder="0" scrolling="no" allowtransparency="true"></iframe></div>'
                    );
                },
            },
            // // TikTok
            // {
            //     regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
            //     embedCallback: function (match) {
            //         const videoId = match[1];
            //         return (
            //             '<div class="social-embed tiktok-embed"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/video/' +
            //             videoId +
            //             '" data-video-id="' +
            //             videoId +
            //             '" style="max-width: 605px;min-width: 325px;"><section></section></blockquote>' +
            //             '<script async src="https://www.tiktok.com/embed.js"></script></div>'
            //         );
            //     },
            // },
            // // Twitter/X
            // {
            //     regex: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/i,
            //     embedCallback: function (match) {
            //         const tweetId = match[2];
            //         return (
            //             '<div class="social-embed twitter-embed"><blockquote class="twitter-tweet"><a href="https://twitter.com/x/status/' +
            //             tweetId +
            //             '"></a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script></div>'
            //         );
            //     },
            // },
        ];

        // URL 감지 및 임베드로 변환 기능
        function replaceUrlWithEmbed(content) {
            if (!content) return content;

            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                const regex = pattern.regex;
                const match = content.match(regex);

                if (match) {
                    return pattern.embedCallback(match);
                }
            }

            return null; // 매칭되는 패턴이 없으면 null 반환
        }

        // 자동 붙여넣기 이벤트 처리는 제거 (창을 통해서만 임베드 가능)

        // 커맨드 등록 - 항상 URL 입력창을 표시
        editor.addCommand("socialEmbed", function () {
            // TinyMCE 6 대화창 API 사용
            editor.windowManager.open({
                title: "소셜 미디어 임베드",
                body: {
                    type: "panel",
                    items: [
                        {
                            type: "input",
                            name: "url",
                            label: "URL 입력",
                            inputMode: "url",
                            placeholder: "https://youtube.com/watch?v=...",
                        },
                        {
                            type: "htmlpanel",
                            html: '<div style="margin-top:10px;font-size:12px;color:#666;">지원되는 플랫폼: 유튜브(영상/쇼츠), 인스타그램(포스트/릴스)</div>',
                        },
                    ],
                },
                buttons: [
                    {
                        type: "cancel",
                        text: "취소",
                    },
                    {
                        type: "submit",
                        text: "삽입",
                        primary: true,
                    },
                ],
                initialData: {
                    url: "",
                },
                onSubmit: function (api) {
                    const data = api.getData();
                    const embed = replaceUrlWithEmbed(data.url);

                    if (embed) {
                        editor.insertContent(embed);
                    } else {
                        editor.notificationManager.open({
                            text: "지원되지 않는 URL 형식입니다.",
                            type: "error",
                            timeout: 3000,
                        });
                    }

                    api.close();
                },
            });
        });

        // 툴바 버튼 추가 - TinyMCE 6 스타일
        editor.ui.registry.addButton("socialembed", {
            icon: "embed-page",
            tooltip: "소셜 미디어 임베드",
            onAction: function () {
                editor.execCommand("socialEmbed");
            },
        });

        // 메뉴 항목 추가 - TinyMCE 6 스타일
        editor.ui.registry.addMenuItem("socialembed", {
            icon: "embed-page",
            text: "소셜 미디어 임베드",
            onAction: function () {
                editor.execCommand("socialEmbed");
            },
        });

        return {
            getMetadata: function () {
                return {
                    name: "소셜 미디어 임베드",
                    url: "https://example.com/tinymce-social-embed",
                };
            },
        };
    });
    tinymce.init({
        selector: id,
        license_key: "gpl",
        language: "ko_KR",
        toolbar_sticky: true,
        height: height,
        noneditable_class: "media-container",
        content_style: `img { max-width: 100%; height: auto; } p {margin-top: 5px; margin-bottom: 5px; padding: 0;}
           .instagram-media, .youtube-media {
            max-width: 100%;
            min-height: 200px;
            background: #efefef;
            pointer-events: none;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            position: relative;
            }
            .instagram-media *,.youtube-media * {
              text-decoration: none;
              display: none;
            }
            .instagram-media::after,.youtube-media::after {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #999;
            font-size: 16px;
            }
            .instagram-media.instagram-reels::after{
            content: 'Instagram Reels';
            }
            .instagram-media.instagram-standard::after{
            content: 'Instagram';
            }
            .youtube-media.youtube-shorts::after {
            content: 'Youtube Shorts';
            }
            .youtube-media.youtube-standard::after {
            content: 'Youtube';
            }
            `,
        plugins: "image lists link anchor charmap media table code help wordcount fullscreen autoresize socialembed",
        toolbar:
            "fontsize | bold italic underline strikethrough | forecolor backcolor | blockquote align bullist numlist | link image socialembed fullscreen code",
        extended_valid_elements:
            "blockquote[class|data-instgrm-permalink|data-instgrm-version|style],script[src|async]",
        menubar: false,
        statusbar: false,
        image_uploadtab: true,
        images_upload_url: upload,
        image_dimensions: false,
        image_description: false,
        media_dimensions: false,
        media_poster: false,
        media_alt_source: false,
        link_title: false,
        readonly: readonly,
        autoresize_bottom_margin: 50,
        // newline_behavior: 'linebreak',
        convert_urls: false,
        setup: (editor) => {
            editor.on("keyup", (e) => {
                editor.save();
                // console.log('keyup');
                validator.checkByElements(textarea); // 이 요소만 유효성 검사 수행
            });
            editor.on("setContent", function (o) {
                if (!o.initial) {
                    // 처음이 아님
                    // console.log("setContent", o);
                }
                editor.save();
                validator.checkByElements(textarea); // 이 요소만 유효성 검사 수행
                // console.log('setContent');
            });
            editor.on("change", () => {
                editor.save();
                // console.log('change');
                validator.checkByElements(textarea); // 이 요소만 유효성 검사 수행
            });
            editor.on("blur", () => {
                // editor.getContainer().style.boxShadow='';
                // editor.getContainer().style.borderColor='';
                editor.save();
                validator.checkByElements(textarea); // 이 요소만 유효성 검사 수행
            });
            editor.ui.registry.addButton("instagram", {
                text: "Instagram",
                onAction: function () {
                    let instaUrl = prompt("Instagram URL을 입력하세요:");
                    if (instaUrl) {
                        let embedCode = `<blockquote class="instagram-media"
                            data-instgrm-permalink="${instaUrl}?utm_source=ig_embed"
                            data-instgrm-version="14"
                            style="background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:326px; padding:0; width:99.375%;">
                        </blockquote>
                        <script async src="//www.instagram.com/embed.js"></script>`;

                        editor.insertContent(embedCode);
                    }
                },
            });
        },
    });
}

function tui(id, options = {}) {
    try {
        var el = document.querySelector("#tui" + id);

        if (el) {
            const myCustomEl = document.createElement("span");
            myCustomEl.style = "cursor: pointer;";

            const icon = document.createElement("img");
            icon.setAttribute(
                "src",
                "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJHXAjPEsYyaGBKGhsiUPuNa4SMc5MVCJ5RDuBVUSQgDlNiro_xHQC&usqp=CAE&s"
            );
            icon.setAttribute("width", "32");
            myCustomEl.appendChild(icon);

            // 팝업 바디 생성
            const container = document.createElement("div");
            const description = document.createElement("p");
            description.textContent = "Youtube 주소를 입력하고 Enter를 누르세요!";

            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = "Insert";

            const urlInput = document.createElement("input");
            urlInput.style.width = "100%";

            // 팝업 input 창에 내용 입력 시 호출됨
            urlInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault(); // 엔터 키 동작 방지
                    //btn.trigger('click');
                }
            });
            btn.addEventListener("click", (e) => {
                let youtubeid = extractYouTubeID(urlInput.value);

                if (youtubeid) {
                    let iframeMarkup =
                        '<div class="video-container"><iframe src="https://www.youtube.com/embed/' +
                        youtubeid +
                        '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><p></p><p></p>';

                    // 마크다운 모드에서 iframe 태그 삽입 후, 팝업을 닫고 위지윅 모드로 변환
                    // editor.changeMode('markdown');
                    // editor.insertText(str);
                    // editor.eventEmitter.emit('closePopup');
                    // editor.changeMode('wysiwyg');

                    editor.changeMode("markdown");
                    editor.insertText(iframeMarkup);
                    editor.eventEmitter.emit("closePopup");
                    // editor.changeMode('wysiwyg');
                } else {
                    alert("유효한 YouTube 주소가 아닙니다.");
                }
            });

            container.appendChild(description);
            container.appendChild(urlInput);
            container.appendChild(btn);

            var editor = new toastui.Editor({
                el: el,
                previewStyle: "vertical",
                width: "100%",
                height: "auto",
                toolbarItems: [
                    ["heading", "bold", "italic", "strike"],
                    ["hr", "quote"],
                    ["ul", "ol", "task", "indent", "outdent"],
                    ["table", "image", "link"],
                    ["code", "codeblock"],
                    [
                        {
                            name: "Youtube",
                            tooltip: "Youtube",
                            el: myCustomEl,
                            popup: {
                                body: container,
                                style: { width: "auto" },
                            },
                        },
                    ],
                ],
                hideModeSwitch: true,
                initialEditType: "wysiwyg",
                // viewer: true,
                customHTMLRenderer: {
                    htmlBlock: {
                        iframe(node) {
                            return [
                                { type: "openTag", tagName: "iframe", outerNewLine: true, attributes: node.attrs },
                                { type: "html", content: node.childrenHTML },
                                { type: "closeTag", tagName: "iframe", outerNewLine: true },
                            ];
                        },
                        div(node) {
                            return [
                                { type: "openTag", tagName: "div", outerNewLine: true, attributes: node.attrs },
                                { type: "html", content: node.childrenHTML },
                                { type: "closeTag", tagName: "div", outerNewLine: true },
                            ];
                        },
                        br(node, context) {
                            return [{ type: "openTag", tagName: "br", outerNewLine: true, selfClose: true }];
                        },
                    },
                },
                // plugins: [youtubePlugin],
                events: {
                    change: function () {
                        console.log("is mark", editor.isMarkdownMode());
                        // if(editor.isMarkdownMode() == true) {
                        //     $('#textarea').val(editor.getMarkdown());
                        // } else {
                        //     $('#textarea').val(editor.getHTML());
                        // }
                        var html = editor.getHTML();
                        if (html == "<p><br></p>") {
                            $("#textarea_html" + id).val("");
                        } else {
                            $("#textarea_html" + id).val(html);
                        }
                        $("#textarea_html" + id).change();
                    },
                },
                hooks: {
                    addImageBlobHook: function (blob, callback) {
                        var formData = new FormData();
                        formData.append("image", blob);
                        formData.append("uuid", "{$uuid}");
                        $.ajax({
                            url: options?.fileserver,
                            enctype: "multipart/form-data",
                            data: formData,
                            dataType: "json",
                            contentType: false,
                            processData: false,
                            cache: false,
                            type: "POST",
                            success: function (data) {
                                callback(data.payload.url, "");
                                return false;
                            },
                            error: function (e) { },
                        });
                    },
                },
                exts: ["scrollSync"],
            });
            if (options?.fileserver) {
            } else {
                editor.removeToolbarItem("image");
            }
        }
    } catch (err) {
        //console.log("error", err);
    }
}

$(function () {
    $.fn.outerHTML = function (s) {
        return s ? this.before(s).remove() : jQuery("<p>").append(this.eq(0).clone()).html();
    };
    String.prototype.replaceAll = function (a, b) {
        return this.replace(new RegExp(a.replace(/([.?*+^$[\]\\(){}|-])/gi, "\\$1"), "ig"), b);
    };

    // 파일찾기 버튼을
    $(document).on("click", ".form-control-filetext:input[type='text'], .btn-file-search-text", function (event) {
        var self = $(this).closest(".input-group-wrapper").find(".form-control-filetext").get(0);
        customConfirm(
            "수정하시겠습니까?<br />수정하시려면 확인 버튼을 클릭한후 파일을 다시 첨부해주세요.",
            function () {
                $(self).removeClass("btn-file-search-text").addClass("btn-file-search");
                $(self).val("");
                var el = $(self).closest(".input-group-wrapper");
                var file_name_view_element = el.find(".form-control-file");
                file_name_view_element.val("");
                var fileTextBox = el.find(".form-control-filetext");

                if (fileTextBox.length) {
                    fileTextBox.attr("type", "file");

                    var checkUploadedFileInput = fileTextBox.attr("name").lastIndexOf("[name]");
                    if (checkUploadedFileInput >= 0) {
                        var fileElementName = fileTextBox.attr("name").replace(/\[name\]$/, "");
                    } else {
                        var fileElementName = fileTextBox.attr("name");
                    }

                    console.log("fileElementName", fileElementName);
                    fileTextBox.attr("name", fileElementName);
                    fileTextBox.attr("readonly", false);

                    el.val("");
                    el.find('[name="' + fileElementName + '[seq]"]').remove();
                    el.find('[name="' + fileElementName + '[type]"]').remove();
                    el.find('[name="' + fileElementName + '[error]"]').remove();
                    el.find('[name="' + fileElementName + '[size]"]').remove();
                    el.find('[name="' + fileElementName + '[file_name_alias_seq]"]').remove();
                    el.find('[name="' + fileElementName + '[path]"]').remove();
                    el.find('[name="' + fileElementName + '[full_path]"]').remove();
                    el.find('[name="' + fileElementName + '[url]"]').remove();
                    el.find(".form-preview").remove();
                }

                // console.log("self", self);
                $(self).closest("form").data("validator").checkByElements([self]);
                fileTextBox.click();
                // console.log("fileTextBox", fileTextBox);
            }
        );

        event.preventDefault();
    });

    // $(document).on("change", ".btn-check", function (event) {
    //     if (!$(this).hasClass("off-click-valid")) {
    //         var form = $(this).closest("form")[0];
    //         var validator = $.data(form, "validator");
    //         validator.isFocus = true;
    //         validator.loadvalid();
    //     }
    //     event.preventDefault();
    //     return true;
    // });

    function totalCountUpdate(wrapper) {
        // console.log("totalCountUpdate", wrapper);
        setTimeout(function () {
            var countElement = wrapper.children("h6").find(".total-count");
            var newCount = wrapper.find(".input-group-wrapper").length;

            // console.log("countElement", countElement);
            // console.log("newCount", newCount);
            // 요소가 존재하는 경우에만 업데이트
            if (countElement.length > 0) {
                countElement.text(newCount);
            }
        }, 100);
    }

    $(document).on("click", "button.btn-plus", function (event) {
        var html = $(this).closest(".input-group-wrapper");
        var outerHtml = html.outerHTML();
        var parentId = $(this).closest(".input-group-wrapper").attr("data-uniqid");
        var parentForm = $(this).closest(".form-element-wrapper");

        var totalCount = parentForm.children("h6").find(".total-count").text();

        var totalCount = parentForm.find("> .form-element > .input-group-wrapper").length;

        var multipleMax = $(this).data("multiple-max");
        if (multipleMax) {
            multipleMax = parseInt(multipleMax);
        } else {
            multipleMax = 0;
        }

        if (totalCount) {
            totalCount = parseInt(totalCount);
        } else {
            totalCount = 0;
        }

        console.log("multipleMax", multipleMax, totalCount);
        if (multipleMax > 0 && totalCount >= multipleMax) {
            alert("최대 개수를 초과했습니다.");
            return false;
        }

        var newId = "__" + uniqid() + "__";

        outerHtml = outerHtml.replaceAll(parentId, newId);
        outerHtml = outerHtml.replaceAll("active", "");
        outerHtml = outerHtml.replaceAll("btn-file-search-text", "btn-file-search");

        var newEl = $(outerHtml);

        newEl.find(".clone-element").remove();
        newEl.find(".tui-body").html("");
        newEl.find(".form-control-file").val("");

        var fileTextBoxs = newEl.find(".form-control-filetext");
        if (fileTextBoxs.length) {
            fileTextBoxs.each(function () {
                var fileTextBox = $(this);
                fileTextBox.attr("type", "file");
                var checkUploadedFileInput = fileTextBox.attr("name").lastIndexOf("[name]");
                if (checkUploadedFileInput >= 0) {
                    var newFileInputName = fileTextBox.attr("name").replace(/\[name\]$/, "");
                } else {
                    var newFileInputName = fileTextBox.attr("name");
                }
                fileTextBox.attr("name", newFileInputName);
                fileTextBox.attr("readonly", false);
            });
        }

        $('input[readonly="readonly"]', newEl).each(function () {
            if (!$(this).data("default")) {
                $(this).data("default", $(this).val());
            }
        });

        var element = newEl.addClass("clone-element").addClass("opacity-75");
        newFormElements(element);

        element.append(
            "<div class='loading spinner-border' role='status'><span class='visually-hidden'>Loading...</span></div>"
        );

        try {
            var ppp = $(this).closest(".input-group-wrapper");
            ppp[0].after(element[0]);
        } catch (err) {
            console.log("qqss", err);
        }

        // console.log(element.find(".tox-tinymce").length);
        if (element.find(".tox-tinymce").length) {
            var tinymceElement = element.find(".tox-tinymce");
            var textareaElement = element.find('[data-type="tinymce"]');
            textareaElement.css("display", "flex");
            var innerid = textareaElement.attr("id") + "_copy";

            textareaElement.attr("id", innerid);
            textareaElement.removeClass("tinymcearea");

            var height = textareaElement.data("height");
            var upload_server = textareaElement.data("upload-server");

            // console.log(tinymceElement, textareaElement);

            tinymceElement.remove();
            setTimeout(function () {
                editor_tinymce("#" + innerid, height, upload_server);
            }, 300);
        }
        var focusElement = ppp.next();

        var autofocus = element.closest("form").data("autofocus");
        if (autofocus) {
            $(focusElement).scrollView();
        }
        try {
            // console.log(ppp);
            setTimeout(function () {
                $(".loading", element).remove();
                element.removeClass("opacity-75");
                // focusElement.scrollView();
                if (parentForm.find(".valid-target").length) {
                    element.closest("form").data("validator").checkByElements(parentForm.find(".valid-target"));
                }
            }, 500);
        } catch (err) {
            console.log("qqss", err);
        }

        totalCountUpdate($(this).closest(".form-element-wrapper"));
        event.preventDefault();
        return true;
    });

    $(document).on("click", "button.btn-copy", function (event) {
        var $wrapper = $(this).closest(".input-group-wrapper");
        var parentId = $wrapper.attr("data-uniqid");
        var newId = "__" + uniqid() + "__";
        var parentForm = $(this).closest(".form-element-wrapper");

        var multipleMax = $(this).data("multiple-max");
        if (multipleMax) {
            multipleMax = parseInt(multipleMax);
        } else {
            multipleMax = 0;
        }

        var totalCount = parentForm.children("h6").find(".total-count").text();

        var totalCount = parentForm.find("> .form-element > .input-group-wrapper").length;

        if (totalCount) {
            totalCount = parseInt(totalCount);
        } else {
            totalCount = 0;
        }

        if (multipleMax > 0 && totalCount >= multipleMax) {
            alert("최대 개수를 초과했습니다.");
            return false;
        }

        // 1. 모든 엘리먼트의 값을 저장
        var elementValues = {};
        $wrapper.find("*").each(function () {
            var $this = $(this);
            var name = $this.attr("name");

            if (name) {
                var type = $this.attr("type");
                // file input 제외
                if (type !== "file") {
                    if (type === "radio") {
                        // radio는 체크된 것의 value를 저장
                        if ($this.prop("checked")) {
                            elementValues[name] = $this.val();
                        }
                    } else if (type === "checkbox") {
                        // checkbox는 체크된 것의 value와 checked 상태 둘 다 저장
                        elementValues[name] = {
                            value: $this.val(),
                            checked: $this.prop("checked"),
                        };
                    } else {
                        elementValues[name] = $this.val();
                    }
                }
            }
        });

        // 2. 전체 HTML 복제 후 문자열 교체
        var cloneHtml = $wrapper[0].outerHTML;
        cloneHtml = cloneHtml.replaceAll(parentId, newId);
        cloneHtml = cloneHtml.replaceAll("btn-file-search-text", "btn-file-search");

        // 3. 교체된 HTML을 새 요소로 생성
        var $newElement = $(cloneHtml);

        try {
            //newEl.find(".clone-element").remove();
            $newElement.find(".tui-body").html("");
            $newElement.find(".form-control-file").val("");

            var fileTextBoxs = $newElement.find(".form-control-filetext");
            if (fileTextBoxs.length) {
                fileTextBoxs.each(function () {
                    var fileTextBox = $(this);
                    fileTextBox.attr("type", "file");
                    var checkUploadedFileInput = fileTextBox.attr("name").lastIndexOf("[name]");
                    if (checkUploadedFileInput >= 0) {
                        var newFileInputName = fileTextBox.attr("name").replace(/\[name\]$/, "");
                    } else {
                        var newFileInputName = fileTextBox.attr("name");
                    }
                    fileTextBox.attr("name", newFileInputName);
                    fileTextBox.attr("readonly", false);
                });
            }
        } catch (err) {
            console.log("qqss", err);
        }

        $newElement.find("div.clone-element.form-preview").remove();

        var element = $newElement.addClass("clone-element").addClass("border").addClass("opacity-75");
        //newFormElements(element, true);

        element.append(
            "<div class='loading spinner-border' role='status'><span class='visually-hidden'>Loading...</span></div>"
        );

        // try {
        //     if ($newElement.find(".select2-hidden-accessible").length) {
        //         var select2element = $newElement.find(".select2-hidden-accessible");
        //         select2element.attr("last-search", "");
        //         select2element.val(null).trigger("change");
        //         var id = select2element.attr("id");
        //         $newElement.find(".select2").remove();
        //         setTimeout(function () {
        //             select2(id);
        //         }, 300);
        //     }

        //     //tui(uid);
        // } catch (err) {
        //     console.log("qqss", err);
        // }

        try {
            // 개선된 버전
            if (element.find(".select2-hidden-accessible").length) {
                element.find(".select2-hidden-accessible").each(function (index) {
                    var $select = $(this);
                    var id = $select.attr("id");
                    var delay = $select.data("delay");
                    var keywordMinLength = $select.data("keyword-min-length");
                    var containerClass = $select.attr("class");

                    // console.log(keywordMinLength, delay, containerClass);
                    // 기존과 동일한 초기화 과정
                    $select.attr("last-search", "");
                    $select.val(null).trigger("change");

                    // 현재 select 요소의 다음에 있는 select2만 제거
                    $select.next(".select2").remove();

                    setTimeout(function () {
                        select2(id, keywordMinLength, delay, containerClass);
                    }, 200 * index);
                });
            }
        } catch (err) {
            console.error("Select2 initialization error:", err);
        }

        // console.log(elementValues);
        // 4. 저장해둔 값들 복원
        $newElement.find("*").each(function () {
            var $this = $(this);
            var newName = $this.attr("name");

            if (newName) {
                var type = $this.attr("type");
                if (type !== "file") {
                    var oldName = newName.replace(newId, parentId);

                    if (type === "radio" || type === "checkbox") {
                        if (elementValues[oldName] !== undefined) {
                            if (type === "radio") {
                                // radio는 value가 일치하는 경우 체크
                                if (elementValues[oldName] === $this.val()) {
                                    $this.prop("checked", true);
                                } else {
                                    $this.prop("checked", false);
                                }
                            } else {
                                // checkbox는 저장된 value와 checked 상태 복원
                                if (elementValues[oldName].value === $this.val()) {
                                    $this.prop("checked", elementValues[oldName].checked);
                                }
                            }
                        } else {
                            // 저장된 값이 없는 경우 default 체크
                            if ($this.data("is-default") == 1) {
                                $this.prop("checked", true);
                            } else {
                                $this.prop("checked", false);
                            }
                        }
                    } else if (elementValues[oldName] !== undefined) {
                        // radio/checkbox가 아닌 경우는 값만 복원
                        $this.val(elementValues[oldName]);
                    }
                    // if (type === "radio" || type === "checkbox") {
                    //     if (elementValues[oldName] !== undefined) {
                    //         // 저장된 값이 있는 경우에만 처리
                    //         if (elementValues[oldName] === true) {
                    //             $this.prop("checked", true);
                    //         } else if ($this.data("is-default") == 1) {
                    //             $this.prop("checked", true);
                    //         } else {
                    //             $this.prop("checked", false);
                    //         }
                    //     }
                    // } else if (elementValues[oldName] !== undefined) {
                    //     // radio/checkbox가 아닌 경우는 값만 복원
                    //     $this.val(elementValues[oldName]);
                    // }
                }
            }
        });

        try {
            // wrapper 체크
            const wrapperElement = $wrapper[0];
            if (!wrapperElement) {
                throw new Error("Wrapper element not found");
            }

            // 부모 요소 체크
            const parentElement = wrapperElement.parentNode;
            if (!parentElement) {
                throw new Error("Parent element not found");
            }

            // 새 요소 생성 및 삽입
            const newElement = $($newElement)[0];
            if (!newElement) {
                throw new Error("New element creation failed");
            }

            // nextSibling을 사용하여 wrapper 다음에 삽입
            parentElement.insertBefore(newElement, wrapperElement.nextSibling);
        } catch (e) {
            console.error("Element insertion failed:", e);
        }
        // 5. DOM에 삽입

        setTimeout(function () {
            $(".loading", $newElement).remove();
            element.removeClass("border").removeClass("opacity-75");
            // focusElement.scrollView();
            $newElement.closest("form").data("validator").checkByElements(parentForm.find(".valid-target"));
        }, 500);

        var focusElement = $wrapper.next();

        var autofocus = element.closest("form").data("autofocus");
        if (autofocus) {
            $(focusElement).scrollView();
        }
        totalCountUpdate($(this).closest(".form-element-wrapper"));
        event.preventDefault();

        return;
        // var parentId = $(this).closest(".input-group-wrapper").attr("data-uniqid");
        // var newId = "__" + uniqid() + "__";

        // outerHtml = outerHtml.replaceAll(parentId, newId);
        // outerHtml = outerHtml.replaceAll("active", "");
        // outerHtml = outerHtml.replaceAll("btn-file-search-text", "btn-file-search");

        var newEl = $(outerHtml);

        // //newEl.find(".clone-element").remove();
        // newEl.find(".tui-body").html("");
        // newEl.find(".form-control-file").val("");

        // var fileTextBoxs = newEl.find(".form-control-filetext");
        // if (fileTextBoxs.length) {
        //     fileTextBoxs.each(function () {
        //         var fileTextBox = $(this);
        //         fileTextBox.attr("type", "file");
        //         var checkUploadedFileInput = fileTextBox.attr("name").lastIndexOf("[name]");
        //         if (checkUploadedFileInput >= 0) {
        //             var newFileInputName = fileTextBox.attr("name").replace(/\[name\]$/, "");
        //         } else {
        //             var newFileInputName = fileTextBox.attr("name");
        //         }
        //         fileTextBox.attr("name", newFileInputName);
        //         fileTextBox.attr("readonly", false);
        //     });
        // }

        var element = newEl.addClass("clone-element").addClass("opacity-75");
        //newFormElements(element, true);

        element.append(
            "<div class='loading spinner-border' role='status'><span class='visually-hidden'>Loading...</span></div>"
        );

        try {
            var ppp = $(this).closest(".input-group-wrapper");
            ppp[0].after(element[0]);
        } catch (err) {
            console.log("qqss", err);
        }

        // // console.log(element.find(".tox-tinymce").length);

        // var focusElement = ppp.next();
        // $(focusElement).scrollView();

        // setTimeout(function () {
        //     $(".loading", element).remove();
        //     element.removeClass("opacity-75");
        //     // focusElement.scrollView();
        //     element.closest("form").data("validator").checkByElements(element.find(".valid-target"));
        // }, 500);

        event.preventDefault();
        return true;
    });

    function newFormElements(element, copy = false) {
        //console.log(element.find(".valid-target").not("[type=radio], [type=checkbox]"));
        if (!copy) {
            element
                .find(".valid-target")
                .not("[type=radio], [type=checkbox]")
                .each(function () {
                    const $this = $(this);

                    // 요소 타입에 따라 다르게 처리
                    if (this.tagName === "SELECT") {
                        $this.prop("selectedIndex", 0); // select의 첫 번째 옵션 선택
                    } else if (this.tagName === "TEXTAREA") {
                        $this.text(""); // textarea 내용 비우기
                    } else {
                        $this.val(""); // 일반 input 필드
                    }
                    // console.log($this);
                    $this.trigger("input");
                });

            element.find(".form-control-file").each(function () {
                const $this = $(this);

                $this.val("");
            });

            // 체크박스 초기화
            element.find("[type='checkbox']").prop("checked", false);

            // 라디오 버튼 초기화
            element.find("[type='radio']").prop("checked", false);

            // 셀렉트 박스 초기화 (첫 번째 옵션 선택)
            element.find("select").prop("selectedIndex", 0);

            // 메시지와 폼 미리보기 제거
            element.find(".message, .form-preview").remove();

            // TinyMCE 에디터 초기화
            element.find("textarea").each(function () {
                var textareaId = $(this).attr("id");
                if (textareaId && tinymce.get(textareaId)) {
                    tinymce.get(textareaId).setContent("");
                }
            });

            // 기본값 설정된 라디오 버튼과 체크박스 처리
            element.find("input[data-is-default]").each(function () {
                var $this = $(this);
                if ($this.data("is-default") == 1) {
                    $this.prop("checked", true);
                    setTimeout(function () {
                        $this.trigger("change");
                    }, 100);
                } else {
                    $this.prop("checked", false);
                }
            });

            // 라디오 버튼과 체크박스를 제외한 input 요소들의 기본값 설정
            element
                .find("input[data-default]")
                .not("[type=radio], [type=checkbox]")
                .each(function () {
                    var $this = $(this);
                    if (
                        undefined !== $this.data("default") ||
                        null !== $this.data("default") ||
                        "" !== $this.data("default")
                    ) {
                        //console.log("default", $this.data("default"));
                        $this.val($this.data("default"));
                    }
                });

            $(".copy-hide", element).hide();
        }
        try {
            // if (element.find(".select2-hidden-accessible").length) {
            //     var select2element = element.find(".select2-hidden-accessible");
            //     select2element.attr("last-search", "");
            //     select2element.val(null).trigger("change");
            //     var id = select2element.attr("id");
            //     element.find(".select2").remove();
            //     setTimeout(function () {
            //         select2(id);
            //     }, 300);
            // }

            // 개선된 버전
            if (element.find(".select2-hidden-accessible").length) {
                element.find(".select2-hidden-accessible").each(function (index) {
                    var $select = $(this);
                    var id = $select.attr("id");
                    var delay = $select.data("delay");
                    var keywordMinLength = $select.data("keyword-min-length");
                    var containerClass = $select.data("class");

                    console.log(keywordMinLength, delay, containerClass);
                    // 기존과 동일한 초기화 과정
                    $select.attr("last-search", "");
                    $select.val(null).trigger("change");

                    // 현재 select 요소의 다음에 있는 select2만 제거
                    $select.next(".select2").remove();

                    setTimeout(function () {
                        select2(id, keywordMinLength, delay, containerClass);
                    }, 200 * index);
                });
            }

            //tui(uid);
        } catch (err) {
            console.log("qqss", err);
        }
    }

    function resetFormElements(element) {
        element
            .find(".valid-target")
            .not("[type=radio], [type=checkbox]")
            .each(function () {
                const $this = $(this);

                // 요소 타입에 따라 다르게 처리
                if (this.tagName === "SELECT") {
                    $this.prop("selectedIndex", 0); // select의 첫 번째 옵션 선택
                } else if (this.tagName === "TEXTAREA") {
                    $this.text(""); // textarea 내용 비우기
                } else {
                    $this.val(""); // 일반 input 필드
                }
                // console.log($this);
                $this.trigger("input");
            });

        element.find(".form-control-file").each(function () {
            const $this = $(this);

            $this.val(""); // 일반 input 필드
        });

        // 체크박스 초기화
        element.find("[type='checkbox']").prop("checked", false);

        // 라디오 버튼 초기화
        element.find("[type='radio']").prop("checked", false);

        // 셀렉트 박스 초기화 (첫 번째 옵션 선택)
        element.find("select").prop("selectedIndex", 0);

        // 메시지와 폼 미리보기 제거
        element.find(".message, .form-preview").remove();

        // TinyMCE 에디터 초기화
        element.find("textarea").each(function () {
            var textareaId = $(this).attr("id");
            if (textareaId && tinymce.get(textareaId)) {
                tinymce.get(textareaId).setContent("");
            }
        });

        // 기본값 설정된 라디오 버튼과 체크박스 처리
        element.find("input[data-is-default]").each(function () {
            var $this = $(this);
            if ($this.data("is-default") == 1) {
                $this.prop("checked", true); //.trigger("change");
            } else {
                $this.prop("checked", false);
            }
        });

        // 라디오 버튼과 체크박스를 제외한 input 요소들의 기본값 설정
        element
            .find("input[data-default]")
            .not("[type=radio], [type=checkbox]")
            .each(function () {
                var $this = $(this);
                if (
                    undefined !== $this.data("default") ||
                    null !== $this.data("default") ||
                    "" !== $this.data("default")
                ) {
                    // console.log("default", $this.data("default"));
                    $this.val($this.data("default"));
                }
            });

        // 파일 업로드 관련 요소 초기화
        element.find(".form-control-filetext:input[type='text'], .btn-file-search-text").each(function () {
            var $this = $(this);
            $this.removeClass("btn-file-search-text").addClass("btn-file-search");
            $this.val("");

            var el = $this.closest(".input-group-wrapper");
            var file_name_view_element = el.find(".form-control-file");
            file_name_view_element.val("");
            var fileTextBox = el.find(".form-control-filetext");

            if (fileTextBox.length) {
                fileTextBox.attr("type", "file");

                var fileElementName = fileTextBox.attr("name").replace(/\[name\]$/, "");
                fileTextBox.attr("name", fileElementName);
                fileTextBox.attr("readonly", false);

                el.val("");
                el.find('[name="' + fileElementName + '[seq]"]').remove();
                el.find('[name="' + fileElementName + '[type]"]').remove();
                el.find('[name="' + fileElementName + '[error]"]').remove();
                el.find('[name="' + fileElementName + '[size]"]').remove();
                el.find('[name="' + fileElementName + '[file_name_alias_seq]"]').remove();
                el.find('[name="' + fileElementName + '[path]"]').remove();
                el.find('[name="' + fileElementName + '[full_path]"]').remove();
                el.find('[name="' + fileElementName + '[url]"]').remove();
                el.find(".form-preview").remove();
            }
        });
        try {
            if (element.find(".select2-hidden-accessible").length) {
                var select2element = element.find(".select2-hidden-accessible");
                select2element.val(null).trigger("change");
                select2element.attr("last-search", "");
            }
        } catch (err) {
            console.log("qqss", err);
        }
    }

    function checkInputValues(element) {
        var hasValue = false;
        element.find(".valid-target").each(function () {
            var $this = $(this);

            if ($this.is('input[type="text"], input[type="password"], textarea')) {
                var defaultValue = $this.data("default");
                if ($this.val().trim() !== "" && $this.val() !== defaultValue) {
                    hasValue = true;
                    return false; // Break the loop
                }
            } else if ($this.is('input[type="checkbox"], input[type="radio"]')) {
                var isDefault = $this.data("is-default") === 1;
                if ($this.prop("checked") && !isDefault) {
                    hasValue = true;
                    return false; // Break the loop
                }
            } else if ($this.is("select")) {
                var defaultValue = $this.data("default");
                if ($this.val() && $this.val() !== "" && $this.val() !== defaultValue) {
                    hasValue = true;
                    return false; // Break the loop
                }
            }
        });

        return hasValue;
    }

    $(document).on("click", ".btn-minus", function (event) {
        try {
            var $form = $(this).closest("form");
            var form = $(this).closest("form")[0];
            var validator = $.data(form, "validator");
            validator.isFocus = true;

            var elementWrap = $(this).parent().parent();
            var parent = elementWrap.parent();
            var element = elementWrap.find(".valid-target");
            var size = parent.children(".input-group-wrapper").length;
            var parentForm = element.closest(".form-element-wrapper");
            var root = $(this).closest(".form-element-wrapper");

            // console.log(elementWrap);
            var found = element.attr("name").match(/(.*)\[__([0-9a-z\-]{13,})__\]$/);

            // var inputGroup = $(this).closest(".input-group-wrapper").eq(0).data("uniqid");
            // var firstElement = elementWrap.find(".valid-target").first();
            // console.log('size:' + size, elementWrap);
            // console.log('checkInputValues(elementWrap)', checkInputValues(elementWrap));
            if (checkInputValues(elementWrap)) {
                if (elementWrap.find(".valid-target").length == 1) {
                    if (size == 1) {
                        var msg = "값을 지우시겠습니까?";
                    } else {
                        var msg = "이 영역을 삭제하시겠습니까?";
                    }
                } else {
                    if (size == 1) {
                        var msg = "이 영역의 값을 지우시겠습니까?";
                    } else {
                        var msg = "이 영역을 삭제하시겠습니까?";
                    }
                }
                if (confirm(msg)) {
                } else {
                    return false;
                }
            }

            if (size > 1) {
                if (elementWrap.prev().length > 0) {
                    var autofocus = element.closest("form").data("autofocus");
                    if (autofocus) {
                        elementWrap.prev().scrollView();
                    }
                }

                elementWrap.remove();

                parent.hide().show(0);

                // validator.loadvalid();
            } else {
                // 첫번째가 삭제요청될 경우 실제로는 삭제하지 않고 초기화
                // resetFormElements(elementWrap);
                found = true;
            }

            if (size == 0 || found) {
                // 배열일 경우나 첫번째일 경우
                //console.log("checkByElements");
                $form.data("validator").checkByElements(parent.find(".valid-target"));
            }

            parent.children(".input-group-wrapper").first().removeClass("clone-element");
        } catch (err) {
            console.log(err);
        }

        event.preventDefault();
        totalCountUpdate(root);

        return true;
    });

    $(document).on("click", ".btn-move-up", function (event) {
        var form = $(this).closest("form")[0];
        var validator = $.data(form, "validator");
        validator.isFocus = true;

        var element = $(this).parent().parent();
        var parent = element.parent();
        var size = parent.children(".input-group-wrapper").length;

        if (size > 1) {
            element.prev().insertAfter(element);

            var autofocus = element.closest("form").data("autofocus");
            if (autofocus) {
                $(element).scrollView();
            }
            // validator.loadvalid();
        }
        parent.children(".input-group-wrapper").first().removeClass("clone-element");

        event.preventDefault();
        return true;
    });

    $(document).on("click", ".btn-move-down", function (event) {
        var form = $(this).closest("form")[0];
        var validator = $.data(form, "validator");
        validator.isFocus = true;

        var element = $(this).parent().parent();
        var parent = element.parent();
        var size = parent.children(".input-group-wrapper").length;

        if (size > 1) {
            element.next().insertBefore(element);

            var autofocus = element.closest("form").data("autofocus");
            if (autofocus) {
                $(element).scrollView();
            }
            // validator.loadvalid();
        }
        parent.children(".input-group-wrapper").first().removeClass("clone-element");

        event.preventDefault();
        return true;
    });
});

function recaptcha_chk(form_element) {
    try {
        var form = $(form_element);
        var recaptcha = form.find(".g-recaptcha");

        var valid = form.valid();
        //consolelog(recaptcha.length, valid);
        if (recaptcha.length) {
            if (grecaptcha.getResponse()) {
                if (valid) {
                    return true;
                }
            } else {
                //alert("reCAPTCHA를 체크해주세요.");
            }
        } else if (valid) {
            return true;
        }

        form.validate().focusInvalid();
        return false;
    } catch (e) {
        console.log(e);
        return false;
    }
}

function onSubmit(form_element) {
    try {
        if (recaptcha_chk(form_element)) {
            var form = $(form_element);

            var formData = new FormData(form[0]);
            $.ajax({
                url: form.attr("action"),
                type: form.attr("method"),
                data: formData,
                processData: false,
                contentType: false,
                dataType: "json",
                success: function (response, status, jqXHR) {
                    $(window).unbind("beforeunload");
                    if (jqXHR.getResponseHeader("Location")) {
                        document.location.href = jqXHR.getResponseHeader("Location");
                    } else if (jqXHR.status === 204) {
                        document.location.reload();
                    } else if (jqXHR.status === 201) {
                        document.location.reload();
                    }
                },
                error: function (jqXHR) {
                    if (jqXHR.status === 401) {
                        document.location.reload();
                    } else {
                        if (jqXHR.responseJSON.message) {
                            alert(jqXHR.responseJSON.message);
                        }
                    }
                },
            });
        }
    } catch (e) {
        console.log(e);
    }
    return false;
}

class DaumPostcode {
    constructor(selector) {
        this.element = $(selector);
        this.form = this.element.closest("form");
        this.parent = this.element.closest(".form-element-wrapper");
        this.iframe = $(".iframe", this.parent);
        this.postcode_element = $(".postcode", this.parent);
        this.extra_address_element = $(".extra_address", this.parent);
        this.address_elemeent = $(".address", this.parent);
        this.detail_element = $(".detail_address", this.parent);
        this.postcode_btn = $(".btn-postcode", this.parent);
        this.close_btn = $(".btn-close", this.parent);

        var that = this;
        this.postcode_btn.click(function (e) {
            that.execDaumPostcode();
        });
        this.close_btn.click(function (e) {
            that.foldDaumPostcode();
        });
    }

    // 우편번호 찾기 찾기 화면을 넣을 element

    foldDaumPostcode() {
        // iframe을 넣은 element를 안보이게 한다.
        this.iframe.get(0).style.display = "none";
    }

    execDaumPostcode() {
        console.log("click");
        // 현재 scroll 위치를 저장해놓는다.
        var currentScroll = Math.max(document.body.scrollTop, document.documentElement.scrollTop);

        var that = this;

        new daum.Postcode({
            oncomplete: function (data) {
                // 팝업에서 검색결과 항목을 클릭했을때 실행할 코드를 작성하는 부분.

                that.element.val(JSON.stringify(data));

                // 각 주소의 노출 규칙에 따라 주소를 조합한다.
                // 내려오는 변수가 값이 없는 경우엔 공백('')값을 가지므로, 이를 참고하여 분기 한다.
                var addr = ""; // 주소 변수
                var extraAddr = ""; // 참고항목 변수

                //사용자가 선택한 주소 타입에 따라 해당 주소 값을 가져온다.
                if (data.userSelectedType === "R") {
                    // 사용자가 도로명 주소를 선택했을 경우
                    addr = data.roadAddress;
                } else {
                    // 사용자가 지번 주소를 선택했을 경우(J)
                    addr = data.jibunAddress;
                }

                // 사용자가 선택한 주소가 도로명 타입일때 참고항목을 조합한다.
                if (data.userSelectedType === "R") {
                    // 법정동명이 있을 경우 추가한다. (법정리는 제외)
                    // 법정동의 경우 마지막 문자가 "동/로/가"로 끝난다.
                    if (data.bname !== "" && /[동|로|가]$/g.test(data.bname)) {
                        extraAddr += data.bname;
                    }
                    // 건물명이 있고, 공동주택일 경우 추가한다.
                    if (data.buildingName !== "" && data.apartment === "Y") {
                        extraAddr += extraAddr !== "" ? ", " + data.buildingName : data.buildingName;
                    }
                    // 표시할 참고항목이 있을 경우, 괄호까지 추가한 최종 문자열을 만든다.
                    if (extraAddr !== "") {
                        extraAddr = " (" + extraAddr + ")";
                    }
                    // 조합된 참고항목을 해당 필드에 넣는다.
                    that.extra_address_element.get(0).value = extraAddr;
                } else {
                    that.extra_address_element.get(0).value = "";
                }

                // 우편번호와 주소 정보를 해당 필드에 넣는다.
                that.postcode_element.get(0).value = data.zonecode;
                that.address_elemeent.get(0).value = addr;
                // 커서를 상세주소 필드로 이동한다.
                if (that.detail_element.get(0)) {
                    that.detail_element.get(0).focus();
                }
                // iframe을 넣은 element를 안보이게 한다.
                // (autoClose:false 기능을 이용한다면, 아래 코드를 제거해야 화면에서 사라지지 않는다.)
                that.iframe.get(0).style.display = "none";

                // 우편번호 찾기 화면이 보이기 이전으로 scroll 위치를 되돌린다.
                document.body.scrollTop = currentScroll;

                that.form.data("validator").checkByElements(that.parent.find(".valid-target"));
            },
            // 우편번호 찾기 화면 크기가 조정되었을때 실행할 코드를 작성하는 부분. iframe을 넣은 element의 높이값을 조정한다.
            onresize: function (size) {
                that.iframe.get(0).style.height = size.height + "px";
            },
            width: "100%",
            height: "100%",
        }).embed(this.iframe.get(0));

        // iframe을 넣은 element를 보이게 한다.
        this.iframe.get(0).style.display = "block";
    }
}

function getJuso(data, targetDiv) {
    console.log(data);
    if (!checkSearchedWord(data.keyword_element)) {
        return;
    }
    var form = data.keyword_element.closest("form")[0];
    var valid_element = data.keyword_element.parent().next().find("select");
    console.log(valid_element);

    var validator = $.data(form, "validator");

    data.keyword = data.keyword_element.val();
    delete data.keyword_element;

    $.ajax({
        url: "https://business.juso.go.kr/addrlink/addrLinkApiJsonp.do",
        type: "post",
        data: data,
        dataType: "jsonp",
        crossDomain: true,
        success: function (jsonStr) {
            var errCode = jsonStr.results.common.errorCode;
            var errDesc = jsonStr.results.common.errorMessage;

            $("#" + targetDiv + " select").val("");
            $("#" + targetDiv).hide();

            if (errCode != "0") {
                alert(errCode + "=" + errDesc);
            } else {
                if (jsonStr != null) {
                    $("#" + targetDiv).show();
                    validator.checkByElements(valid_element);
                    $("#" + targetDiv + " .juso-loader").show();
                    $(".juso-container select").addClass("juso-animation");
                    makeListJson(targetDiv, jsonStr);
                    setTimeout(function () {
                        $("#" + targetDiv + " .juso-loader").hide();
                        $(".juso-container select").one("animationend", function () {
                            $(this).removeClass("juso-animation");
                        });
                    }, 500);

                    console.log($("#" + targetDiv + " .juso-loader"));
                }
            }
        },
        error: function (xhr, status, error) {
            alert("에러발생");
        },
    });
}

function makeListJson(targetDiv, jsonStr) {
    var select = $("#" + targetDiv + " select");
    $("#" + targetDiv + " option:not(:first)").remove();

    $(jsonStr.results.juso).each(function () {
        // console.log(this);
        // console.log(JSON.stringify(this));

        console.log(JSON.stringify(this).length);
        $(select).append(
            $("<option>", {
                value: JSON.stringify(this),
                text: "[" + this.zipNo + "] " + this.roadAddr,
            })
        );
    });
}

//특수문자, 특정문자열(sql예약어의 앞뒤공백포함) 제거
function checkSearchedWord(keyword) {
    if (keyword.val().length > 0) {
        //특수문자 제거
        var expText = /[%=><]/;
        if (expText.test(keyword) == true) {
            alert("특수문자를 입력 할수 없습니다.");
            // keyword = keyword.split(expText).join("");
            keyword.focus();
            return false;
        }

        //특정문자열(sql예약어의 앞뒤공백포함) 제거
        var sqlArray = new Array(
            //sql 예약어
            "OR",
            "SELECT",
            "INSERT",
            "DELETE",
            "UPDATE",
            "CREATE",
            "DROP",
            "EXEC",
            "UNION",
            "FETCH",
            "DECLARE",
            "TRUNCATE"
        );

        var regex;
        for (var i = 0; i < sqlArray.length; i++) {
            regex = new RegExp(sqlArray[i], "gi");

            if (regex.test(keyword)) {
                alert('"' + sqlArray[i] + '"와(과) 같은 특정문자로 검색할 수 없습니다.');
                keyword.focus();
                // keyword = keyword.replace(regex, "");
                return false;
            }
        }
    } else {
        alert("주소 검색어를 입력하세요.");
        keyword.focus();
        return false;
    }
    return true;
}

function enterJuso(event, getAddr) {
    var evt_code = event.which || event.keyCode;
    if (evt_code === 13) {
        event.preventDefault();
        getAddr();
    }
}

//////
$(document).ready(function () {
    // 라디오 버튼에 대한 change 이벤트 트리거 함수
    function triggerChangeEvent($radio) {
        // console.log("Triggering change event for:", $radio[0]);
        if ($radio.length && ($radio[0].onchange || $radio.attr("onchange"))) {
            try {
                setTimeout(function () {
                    $radio.trigger("change");
                }, 0);
            } catch (error) {
                console.error("Error triggering change event:", error);
            }
        }
    }

    // 라디오 버튼 초기화 함수
    function initRadioButton($radio) {
        if ($radio.is(":checked") && !$radio.data("init-processed")) {
            // console.log("Initializing radio button:", $radio[0]);
            triggerChangeEvent($radio);
            $radio.data("init-processed", true);
        }
    }

    // 페이지 로드 시 초기 실행
    $('input[type="radio"][data-init-change="true"]').each(function () {
        initRadioButton($(this));
    });

    // 새로운 라디오 버튼 감지 및 초기화
    $(document).on("input", 'input[type="radio"][data-init-change="true"]', function () {
        initRadioButton($(this));
    });
});

function selectModalItem(element, value, selectText) {
    var parent = $(element).closest(".select-modal-wrap");
    var $element = $(element);
    var $label = $element.closest(".select-modal-label");

    parent.find(".select-model-selected").removeClass("select-model-selected");
    $label.addClass("select-model-selected");
    parent.find(".select-modal-text").val(selectText);
    parent.find(".select-modal-value").val(value);
    // validate
    $element.closest("form").validate().checkByElements(parent.find(".select-modal-value"));
}

// 마지막 보이는 요소에 클래스 추가하는 함수
// function updateLastVisibleClass(formGroup) {
//     // 대상이 특정 form-group이면 해당 요소만 처리, 아니면 모든 form-group 처리
//     const formGroups = formGroup ? [formGroup] : document.querySelectorAll(".form-group");

//     formGroups.forEach((group) => {
//         // 모든 last-child 클래스 제거
//         group.querySelectorAll(":scope > .form-element-wrapper.last-child").forEach((el) => {
//             el.classList.remove("last-child");
//         });

//         // 보이는 요소들만 필터링
//         const visibleElements = Array.from(group.querySelectorAll(":scope > .form-element-wrapper")).filter(
//             (el) => window.getComputedStyle(el).display !== "none"
//         );

//         // 마지막 보이는 요소에 클래스 추가
//         if (visibleElements.length > 0) {
//             visibleElements[visibleElements.length - 1].classList.add("last-child");
//         }
//     });
// }
