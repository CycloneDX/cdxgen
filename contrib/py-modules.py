# https://stackoverflow.com/questions/8808714/how-can-i-access-the-list-of-modules-that-pythons-helpmodules-displays
from pydoc import ModuleScanner

modules = []


def callback(path, modname, desc, modules=modules):
    if modname and modname[-9:] == ".__init__":
        modname = modname[:-9] + " (package)"
    if modname.find(".") < 0:
        modules.append(modname.lower())


def onerror(modname):
    callback(None, modname, None)


ModuleScanner().run(callback, onerror=onerror)
print (modules)
