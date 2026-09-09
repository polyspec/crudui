.PHONY: crudui-engine
crudui-engine:
	cd $(srcdir) && $(CARGO) build --release --locked

crudui.la: crudui-engine
