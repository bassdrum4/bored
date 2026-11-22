package RocketChicken_fla
{
   import flash.display.MovieClip;
   import flash.display.SimpleButton;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol1062")]
   public dynamic class clearData_196 extends MovieClip
   {
      
      public var okbtn:SimpleButton;
      
      public var info:TextField;
      
      public var clearbtn:SimpleButton;
      
      public function clearData_196()
      {
         super();
         addFrameScript(0,this.frame1);
      }
      
      internal function frame1() : *
      {
         this.info.mouseEnabled = false;
         stop();
      }
   }
}

