import os
import shutil
from argparse import ArgumentParser
import json
from hashlib import md5
from time import sleep, time

DEFAULT_DOTOBSIDIAN = os.path.expanduser('~/.config/obsidian/Obsidian Sandbox/.obsidian')

OBSIDIAN_PLUGIN_FILES = [
    'main.js',
    'manifest.json',
    'styles.css'
]

def main(args):
    if not os.path.isdir(args.dotobsidian) or not os.path.exists(args.dotobsidian):
        raise Exception('Invalid path: ' + args.dotobsidian)
    
    # check that dev dir exists and has the files in it
    if not os.path.isdir(args.dev_dir):
        raise Exception('Invalid path: ' + args.dev_dir)
    
    for file in OBSIDIAN_PLUGIN_FILES:
        if not os.path.isfile(os.path.join(args.dev_dir, file)):
            raise Exception('Invalid path: ' + os.path.join(args.dev_dir, file))
        
    # get the "id" from manifest.json
    with open(os.path.join(args.dev_dir, 'manifest.json'), 'r') as f:
        data = json.load(f)

    if 'id' not in data or type(data['id']) != str:
        raise Exception('Invalid manifest file.')
    
    plugin_name = data['id']

    # check if the plugins folder exists, if not, create one
    plugins_folder = os.path.join(args.dotobsidian, 'plugins')
    if not os.path.isdir(plugins_folder):
        os.mkdir(plugins_folder)
    
    # check if the plugin folder exists, if not, create it
    plugin_folder = os.path.join(plugins_folder, plugin_name)
    if not os.path.isdir(plugin_folder):
        os.mkdir(plugin_folder)

    for file in OBSIDIAN_PLUGIN_FILES:
        src = os.path.join(args.dev_dir, file)
        dest = os.path.join(plugin_folder, file)
        shutil.copyfile(src, dest)

if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--dotobsidian', type = str, default = DEFAULT_DOTOBSIDIAN)
    parser.add_argument('--dev-dir', type = str, default = '.')
    parser.add_argument('--onchange', action='store_true')

    args = parser.parse_args()

    main(args)

    if args.onchange:
        file_hashes = {f:None for f in OBSIDIAN_PLUGIN_FILES}
        while True:
            requires_update = False
            for file in OBSIDIAN_PLUGIN_FILES:
                src = os.path.join(args.dev_dir, file)
                src_hash = md5(open(src,'rb').read()).hexdigest()

                if not file_hashes[file] or file_hashes[file] != src_hash:
                    requires_update = True
                    file_hashes[file] = src_hash

            if requires_update:
                print(f'Updating {args.dev_dir} to {args.dotobsidian}')
                main(args)
                
            sleep(3)




    

    
