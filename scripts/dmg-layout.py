import argparse
import json
import os
from pathlib import Path

from ds_store import DSStore
from mac_alias import Alias


def inspect(root):
    with DSStore.open(os.fspath(root / ".DS_Store"), "r") as store:
        window = store["."]["bwsp"]
        icons = store["."]["icvp"]
        view = store["."]["icvl"][1].decode("ascii")
        background = Alias.from_bytes(icons["backgroundImageAlias"])
        return {
            "window": window,
            "iconSize": icons["iconSize"],
            "textSize": icons["textSize"],
            "arrangeBy": icons["arrangeBy"],
            "labelOnBottom": icons["labelOnBottom"],
            "showItemInfo": icons["showItemInfo"],
            "showIconPreview": icons["showIconPreview"],
            "scroll": [icons["scrollPositionX"], icons["scrollPositionY"]],
            "backgroundType": icons["backgroundType"],
            "backgroundFile": background.target.filename,
            "backgroundId": background.target.cnid,
            "backgroundVolume": background.volume.name,
            "view": view,
            "positions": {
                name: list(store[name]["Iloc"])
                for name in ("Moguri.app", "Applications")
            },
        }


parser = argparse.ArgumentParser()
parser.add_argument("action", choices=("build", "inspect"))
parser.add_argument("path", type=Path)
parser.add_argument("output", nargs="?", type=Path)
args = parser.parse_args()
if args.action == "build":
    import dmgbuild

    if args.output is None:
        parser.error("build requires an output image")
    with args.path.open(encoding="utf8") as source:
        options = json.load(source)
    volume = options.pop("volume_name")
    dmgbuild.build_dmg(os.fspath(args.output), volume, settings=options)
else:
    print(json.dumps(inspect(args.path)))
