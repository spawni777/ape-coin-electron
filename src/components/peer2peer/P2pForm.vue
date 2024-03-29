<template>
  <form class="p2p-form">
    <div class="p2p-title">
      Distribution Network
    </div>
    <CoreInput
      v-for="field in form"
      :placeholder="field.placeholder"
      :field-name="field.fieldName"
      :key="field.fieldName"
      :error-msg="field.errorMsg"
      :show-error="!field.valid && highlightErrors"
      v-model:value="field.value"
    />
    <div
      class="switch-box"
      v-for="(item, key) in switches"
      :key="item.name"
    >
      <p>{{ item.name }}</p>
      <CoreSwitch
        @click="item.onClick"
        :ref="key"
        v-model:checked="item.value"
      />
    </div>
    <CoreButton class="p2p-button" @click.prevent="connect">Connect</CoreButton>
  </form>
</template>

<script>
import {
  ref, onMounted, reactive, onBeforeMount,
} from 'vue';
import { useStore } from 'vuex';
import CoreInput from '@/components/main/CoreInput';
import CoreButton from '@/components/main/CoreButton';
import CoreSwitch from '@/components/main/CoreSwitch';
import useForm from '@/use/form/form';
import useTooltip from '@/use/tooltip';
import { ipcRenderer } from 'electron';
import { FROM_BG, TO_BG } from '@/resources/channels';

const required = (val) => !!val;
const isNumeric = (val) => /^\d+$/.test(val);
const parseUrlsAndTestRegExp = (val, regExp) => {
  const urls = val.trim()
    .replace(/[,\s;]+/gi, ',')
    .split(',');

  for (const url of urls) {
    const groups = regExp.exec(url);
    const isValid = (groups && groups[0] === url);

    if (!isValid) {
      return false;
    }
  }
  return true;
};
const validUrl = (val) => parseUrlsAndTestRegExp(
  val,
  /((wss*)*:\/\/)*([\d\w._-]*)(:([\d]+))*([/\d\w._-]+)*/i,
);
const hasPort = (val) => parseUrlsAndTestRegExp(val, /.+:\d+/i);

export default {
  name: 'P2pForm',
  components: {
    CoreInput,
    CoreButton,
    CoreSwitch,
  },
  setup() {
    const switches = reactive({
      ngrok: {
        name: 'ngrok',
        value: false,
      },
      savedPeers: {
        name: 'Saved Peers',
        value: false,
      },
      defaultPeers: {
        name: 'Default Peers',
        value: true,
      },
    });

    const form = useForm({
      peers: {
        value: '',
        fieldName: 'Enter peers',
        placeholder: 'http://yourlink.com:3001',
        validators: {
          noValOrValidUrl: {
            func: (val) => !val || validUrl(val),
            errorMsg: 'Invalid URL',
            priority: 1,
          },
          noValueOrHasPort: {
            func: (val) => !val || hasPort(val),
            errorMsg: 'Please add port',
            priority: 2,
          },
        },
      },
      serverHost: {
        value: '127.0.0.1',
        fieldName: 'Host address',
        placeholder: '127.0.0.1',
        validators: {
          required: {
            func: required,
            errorMsg: 'Please, fill the field',
            priority: 1,
          },
        },
      },
      serverPort: {
        value: '',
        fieldName: 'Server Port',
        placeholder: 'auto',
        validators: {
          noValOrIsNumeric: {
            func: (val) => !val || isNumeric(val),
            errorMsg: 'Port should be a Number',
            priority: 1,
          },
        },
      },
      ngrokAuthToken: {
        value: '',
        fieldName: 'Ngrok Auth Token',
        placeholder: 'Paste your auth key if ngrok active',
        validators: {
          requiredIfOn: {
            func: (val) => !switches.ngrok.value || required(val),
            errorMsg: 'Please, fill the field',
            priority: 1,
          },
        },
        watchTarget: switches.ngrok,
      },
    });

    onBeforeMount(() => {
      ipcRenderer.once(FROM_BG.LOAD_P2P_FORM, (event, savedForm) => {
        Object.keys(form)
          .forEach(key => {
            form[key].value = savedForm.inputs[key];
          });
        Object.keys(switches)
          .forEach(key => {
            switches[key].value = savedForm.switches[key];
          });
      });
      ipcRenderer.send(TO_BG.CHECK_P2P_FORM_SAVING);
    });

    const ngrok = ref(null);
    const defaultPeers = ref(null);
    const savedPeers = ref(null);

    onMounted(() => {
      useTooltip({
        el: ngrok.value,
        id: 'ngrok-switch',
        maxWidth: 300,
        text: 'You should port forward to mine faster, because people will be able to'
          + ' connect to you. You will have as much actual info as connections of your network. '
          + 'But if you can`t port forward you can use ngrok to expose your network. '
          + 'Register for free at ngrok.com and pass ngrok AuthToken to the field above.',
      });
      useTooltip({
        el: savedPeers.value,
        id: 'savedPeers-switch',
        maxWidth: 300,
        text: 'Use peers from previous session.',
      });
      useTooltip({
        el: defaultPeers.value,
        id: 'defaultPeers-switch',
        maxWidth: 250,
        text: 'Connect to our default peers. \n\n'
          + 'It can be useful if you don`t have any peer address.',
      });
    });

    const highlightErrors = ref(false);
    const store = useStore();

    const connect = () => {
      const formIsValid = !Object.values(form)
        .filter(field => !field.valid).length;

      if (!formIsValid) {
        highlightErrors.value = true;
        return;
      }

      const serverOptions = {};
      Object.keys(form)
        .forEach(key => {
          serverOptions[key] = form[key].value;
        });
      Object.keys(switches)
        .forEach(key => {
          serverOptions[key] = switches[key].value;
        });

      store.dispatch('createServer', serverOptions);

      const formattedInputs = {};
      const formattedSwitches = {};
      Object.keys(form)
        .forEach(key => {
          formattedInputs[key] = form[key].value;
        });
      Object.keys(switches)
        .forEach(key => {
          formattedSwitches[key] = switches[key].value;
        });
      ipcRenderer.send(TO_BG.SAVE_P2P_FORM, {
        inputs: formattedInputs,
        switches: formattedSwitches,
      });
    };

    return {
      form,
      switches,
      ngrok,
      defaultPeers,
      savedPeers,
      highlightErrors,
      connect,
    };
  },
};
</script>

<style scoped lang="scss">
.p2p-form {
  margin: auto;

  width: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;

  .p2p-title {
    margin-bottom: 25px;

    font-size: 40px;
    color: $onBgColor;
    text-align: center;
  }

  .core-input {
    margin-top: 20px;
  }

  .switch-box {
    width: 100%;
    align-self: flex-start;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: $onBgColor;
    p {
      margin: 10px;
    }
  }

  .p2p-button {
    margin-top: 16px;
  }
}
</style>
