package generator

import (
	"strings"
	"testing"
)

func TestFormButtonsDefaultDeclaredAndRejected(t *testing.T) {
	plain := compile(t, `{"type":"group","properties":{"name":{"type":"text"}}}`)
	if encode(t, plain.Buttons) != `[{"type":"submit"}]` {
		t.Fatal(encode(t, plain.Buttons))
	}
	f, e := NewForm(plain, parseObject(t, `{}`), BindOptions{Language: "en"})
	if e != nil {
		t.Fatal(e)
	}
	html, _ := RenderForm(f)
	if !strings.HasSuffix(html, `</div><div class="crudui-form__footer"><div class="crudui-controls" role="group" aria-label="Form actions"><button type="submit" class="crudui-action crudui-action--text">Save</button></div></div></div>`) {
		t.Fatal(html)
	}
	declared := compile(t, `{"type":"group","action":{"method":"post","url":"/save"},"buttons":[
		{"type":"submit","name":"__submitted__","value":"go","text":{"ko":"저장하기","en":"Save now"},"design":{"class":"primary"}},
		{"type":"reset"},
		{"type":"button","text":"Cancel","behavior":{"onclick":"history.back()"}},
		{"type":"link","text":"List","href":"../?a=1&b=\"2\""}],"properties":{"name":{"type":"text"}}}`)
	if encode(t, declared.Action) != `{"method":"post","url":"/save"}` {
		t.Fatal(encode(t, declared.Action))
	}
	f, _ = NewForm(declared, parseObject(t, `{}`), BindOptions{Language: "ko"})
	html, _ = RenderForm(f)
	want := `<button type="submit" class="crudui-action crudui-action--text primary" name="__submitted__" value="go">저장하기</button><button type="reset" class="crudui-action crudui-action--text">초기화</button><button type="button" class="crudui-action crudui-action--text" onclick="history.back()">Cancel</button><a class="crudui-action crudui-action--text" href="../?a=1&amp;b=&quot;2&quot;">List</a>`
	if !strings.Contains(html, want) {
		t.Fatal(html)
	}
	for source, message := range map[string]string{
		`{"type":"group","buttons":{},"properties":{}}`:                                        "Invalid buttons at form: expected a list of buttons",
		`{"type":"group","buttons":[{"type":"image"}],"properties":{}}`:                        "Invalid buttons.0.type at form: expected submit, reset, button or link",
		`{"type":"group","buttons":[{"type":"button"}],"properties":{}}`:                       "Invalid buttons.0.text at form: expected content for this button type",
		`{"type":"group","buttons":[{"type":"link","text":"List"}],"properties":{}}`:           "Invalid buttons.0.href at form: expected a link target",
		`{"type":"group","buttons":[{"type":"submit","value":1}],"properties":{}}`:             "Invalid buttons.0.value at form: expected a string",
		`{"type":"group","action":"post","properties":{}}`:                                     "Invalid action at form: expected an object",
		`{"type":"group","properties":{"rows":{"type":"group","buttons":[],"properties":{}}}}`: "Invalid buttons at rows: expected the form root",
	} {
		if _, e := CompileForm(parseObject(t, source), CompileOptions{}); e == nil || e.Error() != message {
			t.Fatalf("%s: %v", source, e)
		}
	}
}
