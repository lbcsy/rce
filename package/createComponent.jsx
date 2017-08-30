import React from 'react';
import createClass from 'create-react-class';
import shallowEqual from './shallowEqual';
import omit from 'lodash/omit';
import pick from 'lodash/pick';
import memoize from 'lodash/memoize';
import isFunction from 'lodash/isFunction';


export default function({ name = '', update = () => {}, view }) {
  // overwrite component name
  view.displayName = name;

  let component = createClass({
    // "@" means it's a hoc/decorator
    displayName: `@RCE_${name}`,

    dispatch(type, payload) {
      let component = this;

      let {
        dispatch,
        props: { model }
      } = component;

      update({
        type, payload, dispatch,
        // Model mutation is async, like react state.
        // Inside update function, we loose reference after model updated.
        // If we want to access latest model, we have to request `component.props.model`.
        // We don't make model a getter here, because getter is only called when we do `object.getter`.
        // If we do destruction at first: `let { getter } = props`, the getter is a static value,
        // which can be a confusing behavior.
        model,
        getLatestModel: () => component.props.model
      });
    },


    componentWillMount() {
      // There are 4 ways to do dispatch in render function:
      // 1. callback = { _ => dispatch(type) }
      // 2. callback = { _ => dispatch(type, constant) }
      // 3. callback = { payload => dispatch(type, resolver(payload)) }
      //    Resolver is pure and constant, lives outside render function
      // 4. callback = { _ => dispatch(type, variableComputedBasedOnComponentProps) }
      //
      // 1,2 can be considered as special cases of 3. 3 can be memoized.
      // Dispatcher is a callback function generator that implement 3.

      let component = this;
      let dispatcher = function(type, payloadResolver = a => a) {
        return function(payload) {
          let resolvedPayload = payloadResolver(payload, component.props);
          component.dispatch(type, resolvedPayload);
        };
      };

      this.dispatcher = memoize(dispatcher);
    },

    shouldComponentUpdate(nextProps) {
      // Consumer can specify variableProps and constantProps.
      // variableProps: only these props need to compare.
      // constantProps: these props wont change, dont compare them.
      // If variableProps are defined, ignore contantProps.
      // This is useful for props like children or callback
      let { props: curProps} = this;
      let { variableProps = [], constantProps = [], cursorProps = [] } = curProps;

      // When passing props, only model is a cursor prop for sure.
      // To achieve better performance,
      // component consumer may want to pass other props as cursors.
      // He could pass a cursorProps prop, specify which props are cursors.
      // These props are extracted later in render function.
      if (cursorProps.length) {
        nextProps = omit(nextProps, ['cursorProps']);
        curProps = omit(curProps, ['cursorProps']);
      }

      if (variableProps.length) {
        let pickVar = props => pick(props, variableProps);
        return !shallowEqual(pickVar(curProps), pickVar(nextProps));

      } else if (constantProps.length) {
        let omitConst = props => omit(props, [...constantProps, 'constantProps']);
        return !shallowEqual(omitConst(curProps), omitConst(nextProps));

      } else {
        return !shallowEqual(curProps, nextProps);
      }
    },

    render() {
      let { dispatch, dispatcher, props } = this;
      let {
        constantProps,
        variableProps,
        cursorProps = [],
        ...otherProps
      } = props;

      let extractedCursorProps = cursorProps.reduce(function(preVal, key) {
        let maybeCursor = props[key];

        let val = ( maybeCursor !== undefined && isFunction(maybeCursor.val) ) ?
            maybeCursor.val() :
            maybeCursor;

        return Object.assign({}, preVal, {
          [key]: val
        });
      }, {});

      return React.createElement(view, {
        ...otherProps,
        ...extractedCursorProps,
        dispatch,
        dispatcher,
      });
    },
  });


  return component;
};

